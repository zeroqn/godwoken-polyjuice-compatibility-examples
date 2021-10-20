// SPDX-License-Identifier: MIT
pragma solidity >0.6.0;

contract RevertMsg {
    uint256 public value;
    
    function test_revert(string memory msg_) public pure {
        revert(msg_);
    }

    function store(uint256 newValue) public {
        revert("no no no no");
        value = newValue;
    }
}
