// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Usurp} from "../src/Usurp.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract UsurpTest is Test {
    Usurp game;
    MockUSDC token;
    address house = makeAddr("house");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint256 constant SEED = 1000e6;
    uint256 constant START = 10e6;

    function setUp() public {
        vm.warp(100000);
        vm.roll(1000);
        token = new MockUSDC();
        game = new Usurp(IERC20(address(token)), house, address(this));
        token.mint(address(this), SEED * 100);
        token.approve(address(game), type(uint256).max);
        fund(alice);
        fund(bob);
        game.seedRound(SEED, START);
    }

    function fund(address player) internal {
        token.mint(player, 1_000_000e6);
        vm.prank(player);
        token.approve(address(game), type(uint256).max);
    }

    function take(address player) internal {
        vm.prank(player);
        game.take("this seems sustainable.");
    }

    function expire() internal {
        Usurp.RoundState memory s = game.getState();
        vm.warp(s.deadline);
        vm.roll(s.lastTakeoverBlock + 300);
    }

    function testFullRound18TakeoversConservesEveryUnit() public {
        uint256 totalIn = SEED;
        uint256 totalRefunds;
        uint256 totalHouse;
        address previous;
        for (uint256 i; i < 18; i++) {
            address player = address(uint160(100 + i));
            fund(player);
            Usurp.RoundState memory beforeState = game.getState();
            uint256 balanceBefore = token.balanceOf(previous);
            uint256 houseBefore = token.balanceOf(house);
            totalIn += beforeState.currentPrice;
            take(player);
            if (previous != address(0)) totalRefunds += token.balanceOf(previous) - balanceBefore;
            totalHouse += token.balanceOf(house) - houseBefore;
            assertEq(token.balanceOf(address(game)), game.getState().potBalance);
            previous = player;
            vm.warp(block.timestamp + 71);
            vm.roll(block.number + 178);
        }
        expire();
        uint256 winnerBefore = token.balanceOf(previous);
        uint256 gross = game.getState().potBalance * 8200 / 10000;
        uint256 fee = game.accruedHoldFee();
        vm.prank(bob); // anyone can settle; the payout still goes to the holder
        game.settle();
        uint256 payout = token.balanceOf(previous) - winnerBefore;
        Usurp.RoundState memory next = game.getState();
        uint256 rollover = next.potBalance;
        assertEq(payout, gross - fee);
        assertEq(totalIn, totalRefunds + totalHouse + payout + rollover);
        assertEq(token.balanceOf(address(game)), rollover);
        assertEq(next.roundId, 2);
        assertEq(uint256(next.status), uint256(Usurp.Status.Active));
        assertEq(next.holder, address(0));
        assertEq(next.currentPrice, START);
        assertEq(next.deadline, 0);
        game.seedRound(25e6, START);
        assertEq(game.getState().potBalance, rollover + 25e6);
        assertEq(game.getState().roundId, 2);
    }

    function testRefundExactAtMultiplePrices() public {
        take(alice);
        for (uint256 i; i < 12; i++) {
            Usurp.RoundState memory s = game.getState();
            vm.warp(block.timestamp + 137);
            uint256 expectedFee = s.previousPrice * 200 * 137 / (10000 * 3600);
            uint256 beforeBalance = token.balanceOf(s.holder);
            take(s.holder == alice ? bob : alice);
            assertEq(token.balanceOf(s.holder) - beforeBalance, s.previousPrice * 10200 / 10000 - expectedFee);
        }
    }

    function testFuzzHoldFeeLinearAndCapped(uint32 elapsed) public {
        take(alice);
        uint256 since = game.getState().holderSince;
        vm.warp(since + elapsed);
        uint256 raw = START * 200 * uint256(elapsed) / (10000 * 3600);
        uint256 cap = START * 10200 / 10000;
        assertEq(game.accruedHoldFee(), raw > cap ? cap : raw);
    }

    function testSettleRequiresTimeBlocksAndAHolder() public {
        vm.expectRevert(Usurp.NothingToSettle.selector);
        game.settle();
        take(alice);
        Usurp.RoundState memory s = game.getState();
        vm.roll(s.lastTakeoverBlock + 300);
        vm.expectRevert(Usurp.DeadlineNotPassed.selector);
        game.settle();
        vm.warp(s.deadline);
        vm.roll(s.lastTakeoverBlock + 299);
        vm.expectRevert(Usurp.TooFewBlocks.selector);
        game.settle();
        vm.roll(s.lastTakeoverBlock + 300);
        game.settle();
        // the next round is open and empty, so there is nothing left to settle
        vm.expectRevert(Usurp.NothingToSettle.selector);
        game.settle();
    }

    function testFirstTakeHasNoRefundAndStartsTimer() public {
        vm.warp(block.timestamp + 100 days);
        take(alice);
        Usurp.RoundState memory s = game.getState();
        assertEq(s.potBalance, SEED + START - START * 250 / 10000);
        assertEq(s.currentPrice, START * 135 / 100);
        assertEq(token.balanceOf(house), START * 250 / 10000);
        assertEq(s.deadline, block.timestamp + 5 minutes);
        assertEq(s.holderSince, block.timestamp);
    }

    function testPauseBlocksTakeButNotSettle() public {
        take(alice);
        game.pause();
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        game.take("");
        expire();
        uint256 before = token.balanceOf(alice);
        vm.prank(bob);
        game.settle();
        assertGt(token.balanceOf(alice), before);
    }

    function testUnpauseRestoresTakeAndRefund() public {
        take(alice);
        game.pause();
        game.unpause();
        uint256 beforeBalance = token.balanceOf(alice);
        take(bob);
        assertEq(token.balanceOf(alice) - beforeBalance, START * 10200 / 10000);
    }

    function testTauntBoundary() public {
        vm.prank(alice);
        game.take(string(new bytes(140)));
        vm.prank(bob);
        vm.expectRevert(Usurp.TauntTooLong.selector);
        game.take(string(new bytes(141)));
    }

    function testUnicodeTauntCountsCharactersAndRejectsMalformedEncoding() public {
        bytes memory taunt;
        for (uint256 i; i < 140; ++i) taunt = bytes.concat(taunt, unicode"é");
        vm.prank(alice);
        game.take(string(taunt));
        assertEq(bytes(game.getState().taunt).length, 280);
        vm.prank(bob);
        vm.expectRevert(Usurp.TauntTooLong.selector);
        game.take(string(bytes.concat(taunt, unicode"é")));
        bytes memory malformed = hex"f0808080";
        vm.prank(bob);
        vm.expectRevert(Usurp.InvalidTauntEncoding.selector);
        game.take(string(malformed));
    }

    function testTakingAnExpiredThroneSettlesItAndStartsTheNextRound() public {
        take(alice);
        take(bob);
        expire();
        Usurp.RoundState memory finished = game.getState();
        uint256 bobBefore = token.balanceOf(bob);
        uint256 payout = finished.potBalance * 8200 / 10000 - game.accruedHoldFee();
        uint256 rollover = finished.potBalance - payout;
        vm.prank(alice);
        game.take("round two.");
        Usurp.RoundState memory next = game.getState();
        assertEq(token.balanceOf(bob) - bobBefore, payout); // the old holder is paid
        assertEq(next.roundId, finished.roundId + 1);
        assertEq(next.holder, alice); // the taker is the first holder of the new round
        assertEq(next.previousPrice, START); // paid the start price, not the old round's price
        assertEq(next.potBalance, rollover + START - START * 250 / 10000);
        assertEq(next.deadline, block.timestamp + 5 minutes);
        assertEq(token.balanceOf(address(game)), next.potBalance);
    }

    function testExpiredTakeWaitsForTheBlockGate() public {
        take(alice);
        Usurp.RoundState memory s = game.getState();
        vm.warp(s.deadline);
        vm.roll(s.lastTakeoverBlock + 299);
        vm.prank(bob);
        vm.expectRevert(Usurp.TooFewBlocks.selector);
        game.take("");
    }

    function testRoundsChainBackToBackAndConserveEveryUnit() public {
        uint256 totalIn = SEED;
        uint256 out;
        for (uint256 r; r < 4; r++) {
            for (uint256 i; i < 5; i++) {
                address player = address(uint160(500 + r * 10 + i));
                fund(player);
                address prev = game.getState().holder;
                uint256 prevBefore = prev == address(0) ? 0 : token.balanceOf(prev);
                uint256 houseBefore = token.balanceOf(house);
                totalIn += game.getState().currentPrice;
                take(player);
                if (prev != address(0)) out += token.balanceOf(prev) - prevBefore;
                out += token.balanceOf(house) - houseBefore;
                vm.warp(block.timestamp + 40);
                vm.roll(block.number + 100);
            }
            expire();
            address winner = game.getState().holder;
            uint256 before = token.balanceOf(winner);
            game.settle();
            out += token.balanceOf(winner) - before;
            assertEq(game.getState().roundId, r + 2);
        }
        assertEq(totalIn, out + game.getState().potBalance);
        assertEq(token.balanceOf(address(game)), game.getState().potBalance);
    }

    function testOwnerGatesAndSeedOnlyTopsUpALiveRound() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        game.seedRound(0, START);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        game.pause();
        vm.expectRevert(Usurp.InvalidPrice.selector);
        game.seedRound(1e6, 0);
        take(alice);
        Usurp.RoundState memory before = game.getState();
        game.seedRound(50e6, 20e6); // adds to the pot; never resets the holder, the price in play or the clock
        Usurp.RoundState memory afterSeed = game.getState();
        assertEq(afterSeed.potBalance, before.potBalance + 50e6);
        assertEq(afterSeed.holder, alice);
        assertEq(afterSeed.currentPrice, before.currentPrice);
        assertEq(afterSeed.deadline, before.deadline);
        assertEq(afterSeed.roundId, before.roundId);
        assertEq(game.startPrice(), 20e6); // applies from the next round
        expire();
        game.settle();
        assertEq(game.getState().currentPrice, 20e6);
    }

    function testLongDelayCannotStrandSmallPot() public {
        Usurp small = new Usurp(IERC20(address(token)), house, address(this));
        small.seedRound(0, START);
        vm.startPrank(alice);
        token.approve(address(small), START);
        small.take("");
        vm.warp(block.timestamp + 60 hours);
        vm.roll(block.number + 300);
        uint256 beforePot = small.getState().potBalance;
        small.settle();
        vm.stopPrank();
        // the fee cap eats the whole payout, and the pot rolls into round two instead of being stranded
        assertEq(small.getState().potBalance, beforePot);
        assertEq(small.getState().roundId, 2);
        assertEq(uint256(small.getState().status), uint256(Usurp.Status.Active));
    }

    function testTransferFailureRollsBackAllState() public {
        take(alice);
        address broke = makeAddr("broke");
        Usurp.RoundState memory beforeState = game.getState();
        vm.prank(broke);
        vm.expectRevert();
        game.take("");
        assertEq(abi.encode(game.getState()), abi.encode(beforeState));
    }

    function testSelfTakeConservesFunds() public {
        take(alice);
        uint256 balanceBefore = token.balanceOf(alice);
        take(alice);
        assertEq(balanceBefore - token.balanceOf(alice), START * 135 / 100 - START * 10200 / 10000);
        assertEq(token.balanceOf(address(game)), game.getState().potBalance);
    }
}
