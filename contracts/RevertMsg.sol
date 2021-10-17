// SPDX-License-Identifier: MIT
pragma solidity >0.6.0;

contract RevertMsg {
    function test_revert(string memory msg_) public pure {
        revert(msg_);
    }
}
