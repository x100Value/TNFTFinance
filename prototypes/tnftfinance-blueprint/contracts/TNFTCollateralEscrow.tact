const ESCROW_STATUS_IDLE: Int = 0;
const ESCROW_STATUS_LOCKED: Int = 1;
const ESCROW_STATUS_RELEASED: Int = 2;
const ESCROW_STATUS_LIQUIDATED: Int = 3;

message ConfirmEscrowedByNft {}

message ReleaseToBorrower {}

message ReleaseToAuctionWinner {
    winner: Address;
}

struct EscrowState {
    status: Int;
    borrower: Address;
    collateralNft: Address;
    lockedAt: Int;
    releasedAt: Int;
    winner: Address;
}

contract TNFTCollateralEscrow {
    owner: Address;
    loanManager: Address;
    borrower: Address;
    collateralNft: Address;

    status: Int;
    lockedAt: Int;
    releasedAt: Int;
    winner: Address;

    init(owner: Address, loanManager: Address, borrower: Address, collateralNft: Address) {
        self.owner = owner;
        self.loanManager = loanManager;
        self.borrower = borrower;
        self.collateralNft = collateralNft;
        self.status = ESCROW_STATUS_IDLE;
        self.lockedAt = 0;
        self.releasedAt = 0;
        self.winner = owner;
    }

    receive(msg: ConfirmEscrowedByNft) {
        let _ = msg;
        require(sender() == self.collateralNft, "only collateral NFT contract");
        require(self.status == ESCROW_STATUS_IDLE, "escrow already used");
        self.status = ESCROW_STATUS_LOCKED;
        self.lockedAt = now();
    }

    receive(msg: ReleaseToBorrower) {
        let _ = msg;
        require(sender() == self.loanManager, "only loan manager");
        require(self.status == ESCROW_STATUS_LOCKED, "escrow not locked");
        self.status = ESCROW_STATUS_RELEASED;
        self.releasedAt = now();
        self.winner = self.borrower;
    }

    receive(msg: ReleaseToAuctionWinner) {
        require(sender() == self.loanManager, "only loan manager");
        require(self.status == ESCROW_STATUS_LOCKED, "escrow not locked");
        self.status = ESCROW_STATUS_LIQUIDATED;
        self.releasedAt = now();
        self.winner = msg.winner;
    }

    get fun get_escrow_state(): EscrowState {
        return EscrowState{
            status: self.status,
            borrower: self.borrower,
            collateralNft: self.collateralNft,
            lockedAt: self.lockedAt,
            releasedAt: self.releasedAt,
            winner: self.winner
        };
    }

    get fun get_is_locked(): Bool {
        return self.status == ESCROW_STATUS_LOCKED;
    }
}
