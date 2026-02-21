const AUCTION_BPS_DENOMINATOR: Int = 10000;
const AUCTION_RESERVE_SHARE_BPS: Int = 3000;

const AUCTION_STATUS_CREATED: Int = 0;
const AUCTION_STATUS_ACTIVE: Int = 1;
const AUCTION_STATUS_SETTLED: Int = 2;

message StartAuction {
    minBid: Int as coins;
    durationSeconds: Int;
}

message PlaceBid {}
message FinalizeAuction {}

struct AuctionState {
    status: Int;
    minBid: Int as coins;
    debtDue: Int as coins;
    startedAt: Int;
    endsAt: Int;
    bestBid: Int as coins;
    bestBidder: Address;
    settledDebtCover: Int as coins;
    settledReserveCut: Int as coins;
    settledBorrowerRemainder: Int as coins;
}

contract TNFTLiquidationAuction {
    owner: Address;
    auctionManager: Address;
    reserveVault: Address;
    borrower: Address;
    lender: Address;
    debtDue: Int as coins;

    status: Int;
    minBid: Int as coins;
    startedAt: Int;
    endsAt: Int;
    bestBid: Int as coins;
    bestBidder: Address;

    settledDebtCover: Int as coins;
    settledReserveCut: Int as coins;
    settledBorrowerRemainder: Int as coins;

    init(
        owner: Address,
        auctionManager: Address,
        reserveVault: Address,
        borrower: Address,
        lender: Address,
        debtDue: Int as coins
    ) {
        require(debtDue > 0, "debtDue must be positive");
        self.owner = owner;
        self.auctionManager = auctionManager;
        self.reserveVault = reserveVault;
        self.borrower = borrower;
        self.lender = lender;
        self.debtDue = debtDue;
        self.status = AUCTION_STATUS_CREATED;
        self.minBid = debtDue;
        self.startedAt = 0;
        self.endsAt = 0;
        self.bestBid = 0;
        self.bestBidder = owner;
        self.settledDebtCover = 0;
        self.settledReserveCut = 0;
        self.settledBorrowerRemainder = 0;
    }

    receive(msg: StartAuction) {
        require(sender() == self.auctionManager, "only auction manager");
        require(self.status == AUCTION_STATUS_CREATED, "auction already started");
        require(msg.durationSeconds > 0, "invalid duration");

        self.status = AUCTION_STATUS_ACTIVE;
        self.minBid = msg.minBid;
        self.startedAt = now();
        self.endsAt = now() + msg.durationSeconds;
    }

    receive(msg: PlaceBid) {
        let _ = msg;
        require(self.status == AUCTION_STATUS_ACTIVE, "auction is not active");
        require(now() <= self.endsAt, "auction ended");

        let bid: Int = context().value;
        require(bid >= self.minBid, "bid below minBid");
        require(bid > self.bestBid, "bid must improve");

        if (self.bestBid > 0) {
            send(SendParameters{
                to: self.bestBidder,
                value: self.bestBid,
                mode: SendIgnoreErrors,
                bounce: false
            });
        }

        self.bestBid = bid;
        self.bestBidder = sender();
    }

    receive(msg: FinalizeAuction) {
        let _ = msg;
        require(self.status == AUCTION_STATUS_ACTIVE, "auction not active");
        require(now() > self.endsAt, "auction still running");
        self.status = AUCTION_STATUS_SETTLED;

        let debtCover: Int = self.minInt(self.bestBid, self.debtDue);
        self.settledDebtCover = debtCover;

        if (debtCover > 0) {
            send(SendParameters{
                to: self.lender,
                value: debtCover,
                mode: SendDefaultMode,
                bounce: true
            });
        }

        if (self.bestBid > debtCover) {
            let surplus: Int = self.bestBid - debtCover;
            let reserveCut: Int = self.mulDivDown(surplus, AUCTION_RESERVE_SHARE_BPS, AUCTION_BPS_DENOMINATOR);
            let borrowerRemainder: Int = surplus - reserveCut;

            self.settledReserveCut = reserveCut;
            self.settledBorrowerRemainder = borrowerRemainder;

            if (reserveCut > 0) {
                send(SendParameters{
                    to: self.reserveVault,
                    value: reserveCut,
                    mode: SendIgnoreErrors,
                    bounce: false
                });
            }

            if (borrowerRemainder > 0) {
                send(SendParameters{
                    to: self.borrower,
                    value: borrowerRemainder,
                    mode: SendIgnoreErrors,
                    bounce: false
                });
            }
        }
    }

    get fun get_auction_state(): AuctionState {
        return AuctionState{
            status: self.status,
            minBid: self.minBid,
            debtDue: self.debtDue,
            startedAt: self.startedAt,
            endsAt: self.endsAt,
            bestBid: self.bestBid,
            bestBidder: self.bestBidder,
            settledDebtCover: self.settledDebtCover,
            settledReserveCut: self.settledReserveCut,
            settledBorrowerRemainder: self.settledBorrowerRemainder
        };
    }

    fun minInt(a: Int, b: Int): Int {
        if (a < b) {
            return a;
        }
        return b;
    }

    fun mulDivDown(value: Int, numerator: Int, denominator: Int): Int {
        return (value * numerator) / denominator;
    }
}
