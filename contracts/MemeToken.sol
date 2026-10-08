// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MemeToken
 * @dev Minimal ERC-20 meme token for QMS Testnet deployment
 *      Name and symbol are set at deploy time — fully dynamic.
 */
contract MemeToken {
    string  public name;
    string  public symbol;
    uint8   public constant decimals = 18;
    uint256 public totalSupply;

    address public owner;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _totalSupplyTokens   // human units, e.g. 1_000_000_000
    ) {
        name        = _name;
        symbol      = _symbol;
        owner       = msg.sender;
        uint256 amt = _totalSupplyTokens * (10 ** decimals);
        totalSupply = amt;
        balanceOf[msg.sender] = amt;
        emit Transfer(address(0), msg.sender, amt);
    }

    // ─── ERC-20 core ────────────────────────────────────────────────────────

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "Allowance exceeded");
        allowance[from][msg.sender] -= value;
        _transfer(from, to, value);
        return true;
    }

    // ─── Owner utils ─────────────────────────────────────────────────────────

    /**
     * @dev Batch airdrop to multiple addresses in one tx.
     *      amounts[] is in raw wei (18 decimals).
     */
    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner {
        require(recipients.length == amounts.length, "Length mismatch");
        for (uint256 i = 0; i < recipients.length; i++) {
            _transfer(msg.sender, recipients[i], amounts[i]);
        }
    }

    function renounceOwnership() external onlyOwner {
        emit OwnershipTransferred(owner, address(0));
        owner = address(0);
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    function _transfer(address from, address to, uint256 value) internal {
        require(to != address(0), "Zero address");
        require(balanceOf[from] >= value, "Insufficient balance");
        balanceOf[from] -= value;
        balanceOf[to]   += value;
        emit Transfer(from, to, value);
    }
}
