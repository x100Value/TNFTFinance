contract NFTCollateralLoan {
    nftAddress: Address;
    borrower: Address;
    lender: Address;
    loanAmount: Int as coins;
    dueDate: Int;
    isActive: Bool;
    
    init(nft: Address, amount: Int, duration: Int) {
        self.nftAddress = nft;
        self.borrower = sender();
        self.loanAmount = amount;
        self.dueDate = now() + duration;
        self.isActive = true;
    }
    
    // Loan repayment function
    function repay() {
        require(self.isActive);
        require(sender() == self.borrower);
        require(now() <= self.dueDate);
        
        // Return NFT to borrower
        self.isActive = false;
    }
    
    // Liquidation function (if overdue)
    function liquidate() {
        require(self.isActive);
        require(now() > self.dueDate);
        require(sender() == self.lender);
        
        // NFT goes to lender
        self.isActive = false;
    }
    
    // Get loan information
    function getInfo(): (Address, Address, Int, Int, Bool) {
        return (self.nftAddress, self.borrower, self.loanAmount, self.dueDate, self.isActive);
    }
}
