// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice A single throne, denominated in a trusted, non-rebasing 6-decimal USDC token.
/// @dev No owner withdrawals or parameter changes. All division rounds down in token units.
/// Rounds run back to back with no operator: once the clock runs out, anyone can settle(), which pays the
/// holder and opens the next round with the rollover as its pot, and taking an expired throne settles it first.
contract Usurp is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MULTIPLIER = 135;
    uint256 public constant REFUND_BPS = 10200;
    uint256 public constant HOUSE_BPS = 250;
    uint256 public constant HOLD_FEE_BPS_PER_HOUR = 200;
    uint256 public constant ROUND_DURATION = 5 minutes;
    uint256 public constant WINNER_BPS = 8200;
    uint256 public constant MIN_BLOCKS_TO_CLAIM = 300;

    /// @dev Rounds now roll straight into the next one, so Ended is never reached; it stays for ABI stability.
    enum Status { Pending, Active, Ended }

    struct RoundState {
        uint256 roundId;
        address holder;
        uint256 currentPrice;
        uint256 previousPrice;
        uint256 potBalance;
        uint256 deadline;
        uint256 lastTakeoverBlock;
        uint256 holderSince;
        string taunt;
        Status status;
    }

    IERC20 public immutable usdc;
    address public immutable house;
    /// @notice Price of the first take in every new round. Set by the owner's seed; applies to empty thrones and future rounds.
    uint256 public startPrice;
    RoundState private round;

    error InvalidAddress();
    error InvalidPrice();
    error RoundNotActive();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error TooFewBlocks();
    error NothingToSettle();
    error TauntTooLong();
    error InvalidTauntEncoding();

    event Taken(uint256 indexed roundId, address indexed taker, uint256 pricePaid,
        address indexed prevHolder, uint256 refundPaid, uint256 holdFeeCharged,
        uint256 potAfter, uint256 deadline, string taunt);
    event Claimed(uint256 indexed roundId, address indexed winner, uint256 payout, uint256 rolledToNext);
    event Seeded(uint256 indexed roundId, uint256 amount, uint256 startPrice);
    event RoundStarted(uint256 indexed roundId, uint256 pot, uint256 startPrice);

    constructor(IERC20 token, address houseAddress, address initialOwner) Ownable(initialOwner) {
        if (address(token) == address(0) || address(token).code.length == 0 || houseAddress == address(0)
            || houseAddress == address(this)) revert InvalidAddress();
        usdc = token;
        house = houseAddress;
    }

    /// @notice Owner seed. The first call opens round one; afterwards it only adds money to the current pot and sets the
    /// start price for empty thrones and future rounds. It never touches a holder, a price in play, or a clock.
    function seedRound(uint256 seedAmount, uint256 newStartPrice) external onlyOwner nonReentrant {
        if (newStartPrice == 0) revert InvalidPrice();
        startPrice = newStartPrice;
        if (round.status != Status.Active) {
            _openRound(round.potBalance + seedAmount);
        } else {
            round.potBalance += seedAmount;
            if (round.holder == address(0)) round.currentPrice = newStartPrice;
        }
        if (seedAmount != 0) usdc.safeTransferFrom(msg.sender, address(this), seedAmount);
        emit Seeded(round.roundId, seedAmount, newStartPrice);
    }

    /// @notice Take the throne. If the clock has run out, the finished round is settled first (the holder is paid) and
    /// the caller becomes the first holder of the next round at the start price.
    function take(string calldata taunt) external whenNotPaused nonReentrant {
        if (round.status != Status.Active) revert RoundNotActive();
        if (round.holder != address(0) && block.timestamp >= round.deadline) _settle();
        _validateTaunt(bytes(taunt));

        address previousHolder = round.holder;
        uint256 paid = round.currentPrice;
        uint256 houseFee = Math.mulDiv(paid, HOUSE_BPS, 10000);
        uint256 holdFee = accruedHoldFee();
        uint256 refund = previousHolder == address(0) ? 0 : Math.mulDiv(round.previousPrice, REFUND_BPS, 10000) - holdFee;

        round.holder = msg.sender;
        round.previousPrice = paid;
        round.currentPrice = Math.mulDiv(paid, MULTIPLIER, 100);
        round.potBalance += paid - houseFee - refund;
        round.deadline = block.timestamp + ROUND_DURATION;
        round.lastTakeoverBlock = block.number;
        round.holderSince = block.timestamp;
        round.taunt = taunt;

        usdc.safeTransferFrom(msg.sender, address(this), paid);
        if (refund != 0) usdc.safeTransfer(previousHolder, refund);
        if (houseFee != 0) usdc.safeTransfer(house, houseFee);
        emit Taken(round.roundId, msg.sender, paid, previousHolder, refund, holdFee,
            round.potBalance, round.deadline, taunt);
    }

    /// @notice Anyone can settle a finished round. The payout always goes to the holder, never the caller, and the next
    /// round opens immediately. Pausing never blocks settlement.
    function settle() external nonReentrant { _settle(); }

    function _settle() private {
        if (round.status != Status.Active) revert RoundNotActive();
        if (round.holder == address(0)) revert NothingToSettle();
        if (block.timestamp < round.deadline) revert DeadlineNotPassed();
        if (block.number - round.lastTakeoverBlock < MIN_BLOCKS_TO_CLAIM) revert TooFewBlocks();

        address winner = round.holder;
        uint256 gross = Math.mulDiv(round.potBalance, WINNER_BPS, 10000);
        // Hold fees stay in rollover. Also cap at gross winnings so a long delay
        // cannot underflow or permanently strand a round with a small pot.
        uint256 payout = gross - Math.min(accruedHoldFee(), gross);
        uint256 rollover = round.potBalance - payout;
        uint256 finished = round.roundId;
        _openRound(rollover);
        if (payout != 0) usdc.safeTransfer(winner, payout);
        emit Claimed(finished, winner, payout, rollover);
    }

    /// @dev An open round has no holder and no clock: an empty throne must never strand its pot.
    function _openRound(uint256 pot) private {
        uint256 nextId = round.roundId + 1;
        round = RoundState(nextId, address(0), startPrice, 0, pot, 0, 0, 0, "", Status.Active);
        emit RoundStarted(nextId, pot, startPrice);
    }

    function accruedHoldFee() public view returns (uint256) {
        if (round.holder == address(0) || round.status != Status.Active) return 0;
        // 51 hours reaches the 102% refund cap. Clamp time before multiplying.
        uint256 elapsed = Math.min(block.timestamp - round.holderSince, REFUND_BPS * 1 hours / HOLD_FEE_BPS_PER_HOUR);
        return Math.mulDiv(round.previousPrice, HOLD_FEE_BPS_PER_HOUR * elapsed, 10000 * 1 hours);
    }

    function getState() external view returns (RoundState memory) { return round; }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    /// @dev Count Unicode scalar values, so non-ASCII characters use one slot.
    /// Reject malformed UTF-8 rather than allowing byte-limit evasion.
    function _validateTaunt(bytes calldata value) private pure {
        if (value.length > 560) revert TauntTooLong();
        uint256 count;
        for (uint256 i; i < value.length;) {
            if (++count > 140) revert TauntTooLong();
            uint8 lead = uint8(value[i]);
            uint256 width;
            if (lead < 0x80) width = 1;
            else if (lead >= 0xc2 && lead <= 0xdf) width = 2;
            else if (lead >= 0xe0 && lead <= 0xef) width = 3;
            else if (lead >= 0xf0 && lead <= 0xf4) width = 4;
            else revert InvalidTauntEncoding();
            if (i + width > value.length) revert InvalidTauntEncoding();
            for (uint256 j = 1; j < width; ++j) {
                if (uint8(value[i + j]) < 0x80 || uint8(value[i + j]) > 0xbf) revert InvalidTauntEncoding();
            }
            if (width >= 3) {
                uint8 second = uint8(value[i + 1]);
                if ((lead == 0xe0 && second < 0xa0) || (lead == 0xed && second >= 0xa0)
                    || (lead == 0xf0 && second < 0x90) || (lead == 0xf4 && second >= 0x90)) revert InvalidTauntEncoding();
            }
            i += width;
        }
    }
}
