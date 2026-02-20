const STATUS_OPEN: Int = 0;
const STATUS_FUNDED: Int = 1;
const STATUS_REPAID: Int = 2;
const STATUS_LIQUIDATED: Int = 3;
const STATUS_CANCELLED: Int = 4;

const BPS_DENOMINATOR: Int = 10000;
const MAX_LTV_BPS_HARD: Int = 7000;
const MAX_TERM_SECONDS: Int = 30 * 24 * 60 * 60;
const MAX_ORACLE_MAX_AGE_SECONDS: Int = 10 * 60;
const MIN_RISK_TIMELOCK_SECONDS: Int = 24 * 60 * 60;

message SetOraclePrice {
    price: Int as coins;
    updatedAt: Int;
}

message FundLoan {}
message Repay {}
message Liquidate {}
message CancelLoan {}

message SetPaused {
    paused: Bool;
}

message ProposeRiskParams {
    nextMaxLtvBps: Int;
    nextOracleMaxAge: Int;
}

message ApplyRiskParams {}

struct LoanState {
    status: Int;
    lender: Address;
    startedAt: Int;
    dueAt: Int;
    oraclePrice: Int as coins;
    oracleUpdatedAt: Int;
    paused: Bool;
}

struct RiskState {
    maxLtvBps: Int;
    oracleMaxAge: Int;
    riskTimelock: Int;
    pendingMaxLtvBps: Int;
    pendingOracleMaxAge: Int;
    pendingEta: Int;
    riskVersion: Int;
}

contract NFTCollateralLoan {
    owner: Address;
    borrower: Address;
    collateralNft: Address;

    principal: Int as coins;
    repayAmount: Int as coins;
    termSeconds: Int;

    maxLtvBps: Int;
    oracleMaxAge: Int;
    riskTimelock: Int;

    lender: Address;
    status: Int;
    startedAt: Int;
    dueAt: Int;
    paused: Bool;

    oraclePrice: Int as coins;
    oracleUpdatedAt: Int;

    pendingMaxLtvBps: Int;
    pendingOracleMaxAge: Int;
    pendingEta: Int;
    riskVersion: Int;

    init(
        owner: Address,
        borrower: Address,
        collateralNft: Address,
        principal: Int as coins,
        repayAmount: Int as coins,
        termSeconds: Int,
        maxLtvBps: Int,
        oracleMaxAge: Int,
        riskTimelock: Int
    ) {
        require(principal > 0, "principal must be positive");
        require(repayAmount >= principal, "repay must be >= principal");
        require(termSeconds > 0 && termSeconds <= MAX_TERM_SECONDS, "invalid term");
        require(maxLtvBps > 0 && maxLtvBps <= MAX_LTV_BPS_HARD, "invalid maxLtvBps");
        require(oracleMaxAge > 0 && oracleMaxAge <= MAX_ORACLE_MAX_AGE_SECONDS, "invalid oracleMaxAge");
        require(riskTimelock >= MIN_RISK_TIMELOCK_SECONDS, "risk timelock too short");

        self.owner = owner;
        self.borrower = borrower;
        self.collateralNft = collateralNft;
        self.principal = principal;
        self.repayAmount = repayAmount;
        self.termSeconds = termSeconds;

        self.maxLtvBps = maxLtvBps;
        self.oracleMaxAge = oracleMaxAge;
        self.riskTimelock = riskTimelock;

        self.lender = owner;
        self.status = STATUS_OPEN;
        self.startedAt = 0;
        self.dueAt = 0;
        self.paused = false;

        self.oraclePrice = 0;
        self.oracleUpdatedAt = 0;

        self.pendingMaxLtvBps = 0;
        self.pendingOracleMaxAge = 0;
        self.pendingEta = 0;
        self.riskVersion = 1;
    }

    receive() {
        // Accept empty internal message, including deploy with null body.
    }

    receive(msg: SetOraclePrice) {
        self.requireOwner();
        require(msg.price > 0, "invalid oracle price");
        require(msg.updatedAt <= now(), "oracle timestamp in future");
        require(msg.updatedAt >= self.oracleUpdatedAt, "oracle rollback");

        self.oraclePrice = msg.price;
        self.oracleUpdatedAt = msg.updatedAt;
    }

    receive(msg: FundLoan) {
        let _ = msg;
        require(self.status == STATUS_OPEN, "loan not open");
        require(!self.paused, "loan is paused");
        require(self.isOracleFresh(), "oracle stale");

        let maxBorrow: Int = self.mulDivDown(self.oraclePrice, self.maxLtvBps, BPS_DENOMINATOR);
        require(self.principal <= maxBorrow, "ltv too high");

        let incoming: Int = context().value;
        require(incoming >= self.principal, "insufficient funding value");

        self.lender = sender();
        self.startedAt = now();
        self.dueAt = self.startedAt + self.termSeconds;
        self.status = STATUS_FUNDED;

        send(SendParameters{
            to: self.borrower,
            value: self.principal,
            mode: SendDefaultMode,
            bounce: true
        });

        let refund: Int = incoming - self.principal;
        if (refund > 0) {
            send(SendParameters{
                to: sender(),
                value: refund,
                mode: SendIgnoreErrors,
                bounce: false
            });
        }
    }

    receive(msg: Repay) {
        let _ = msg;
        require(self.status == STATUS_FUNDED, "loan not funded");
        require(sender() == self.borrower, "only borrower");
        require(now() <= self.dueAt, "loan overdue");

        let incoming: Int = context().value;
        require(incoming >= self.repayAmount, "insufficient repay value");

        self.status = STATUS_REPAID;

        send(SendParameters{
            to: self.lender,
            value: self.repayAmount,
            mode: SendDefaultMode,
            bounce: true
        });

        let refund: Int = incoming - self.repayAmount;
        if (refund > 0) {
            send(SendParameters{
                to: sender(),
                value: refund,
                mode: SendIgnoreErrors,
                bounce: false
            });
        }
    }

    receive(msg: Liquidate) {
        let _ = msg;
        require(self.status == STATUS_FUNDED, "loan not funded");
        require(now() > self.dueAt, "loan is not overdue");
        require(sender() == self.lender || sender() == self.owner, "only lender or owner");

        self.status = STATUS_LIQUIDATED;
    }

    receive(msg: CancelLoan) {
        let _ = msg;
        require(self.status == STATUS_OPEN, "loan not open");
        require(sender() == self.borrower, "only borrower");

        self.status = STATUS_CANCELLED;
    }

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: ProposeRiskParams) {
        self.requireOwner();
        require(msg.nextMaxLtvBps > 0 && msg.nextMaxLtvBps <= MAX_LTV_BPS_HARD, "invalid next maxLtvBps");
        require(msg.nextOracleMaxAge > 0 && msg.nextOracleMaxAge <= MAX_ORACLE_MAX_AGE_SECONDS, "invalid next oracleMaxAge");

        self.pendingMaxLtvBps = msg.nextMaxLtvBps;
        self.pendingOracleMaxAge = msg.nextOracleMaxAge;
        self.pendingEta = now() + self.riskTimelock;
    }

    receive(msg: ApplyRiskParams) {
        let _ = msg;
        self.requireOwner();
        require(self.pendingEta > 0, "no pending risk update");
        require(now() >= self.pendingEta, "timelock is active");

        self.maxLtvBps = self.pendingMaxLtvBps;
        self.oracleMaxAge = self.pendingOracleMaxAge;
        self.pendingEta = 0;
        self.pendingMaxLtvBps = 0;
        self.pendingOracleMaxAge = 0;
        self.riskVersion = self.riskVersion + 1;
    }

    get fun get_owner(): Address {
        return self.owner;
    }

    get fun get_loan_state(): LoanState {
        return LoanState{
            status: self.status,
            lender: self.lender,
            startedAt: self.startedAt,
            dueAt: self.dueAt,
            oraclePrice: self.oraclePrice,
            oracleUpdatedAt: self.oracleUpdatedAt,
            paused: self.paused
        };
    }

    get fun get_risk_state(): RiskState {
        return RiskState{
            maxLtvBps: self.maxLtvBps,
            oracleMaxAge: self.oracleMaxAge,
            riskTimelock: self.riskTimelock,
            pendingMaxLtvBps: self.pendingMaxLtvBps,
            pendingOracleMaxAge: self.pendingOracleMaxAge,
            pendingEta: self.pendingEta,
            riskVersion: self.riskVersion
        };
    }

    get fun get_oracle_is_fresh(): Bool {
        return self.isOracleFresh();
    }

    fun requireOwner() {
        require(sender() == self.owner, "only owner");
    }

    fun mulDivDown(value: Int, numerator: Int, denominator: Int): Int {
        return (value * numerator) / denominator;
    }

    fun isOracleFresh(): Bool {
        if (self.oraclePrice <= 0) {
            return false;
        }

        if (self.oracleUpdatedAt <= 0) {
            return false;
        }

        if (self.oracleUpdatedAt > now()) {
            return false;
        }

        return (now() - self.oracleUpdatedAt) <= self.oracleMaxAge;
    }
}
