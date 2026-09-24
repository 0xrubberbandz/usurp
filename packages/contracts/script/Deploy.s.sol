// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Usurp} from "../src/Usurp.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        // This script intentionally deploys mock USDC only on Monad testnet.
        require(block.chainid == 10143, "expected Monad testnet (10143)");
        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        address house = vm.envAddress("HOUSE_ADDRESS");
        uint256 seed = vm.envOr("SEED_AMOUNT", uint256(1000e6));
        uint256 start = vm.envOr("START_PRICE", uint256(10e6));
        vm.startBroadcast(key);
        MockUSDC token = new MockUSDC();
        Usurp game = new Usurp(IERC20(address(token)), house, deployer);
        token.mint(deployer, seed);
        token.approve(address(game), seed);
        game.seedRound(seed, start);
        vm.stopBroadcast();

        string memory object = "deployment";
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeString(object, "name", "monad testnet");
        vm.serializeAddress(object, "usurp", address(game));
        vm.serializeAddress(object, "usdc", address(token));
        vm.serializeAddress(object, "house", house);
        // The wrapper replaces this with the mined creation block after broadcast.
        string memory json = vm.serializeString(object, "deploymentBlock", vm.toString(block.number));
        vm.writeJson(json, "../../apps/web/public/deployments/monad-testnet.json");
    }
}
