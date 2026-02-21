const POOL_BPS_DENOMINATOR: Int = 10000;
const POOL_YEAR_SECONDS: Int = 365 * 24 * 60 * 60;

const POOL_BORROW_BASE_APR_BPS: Int = 1500;
const POOL_BORROW_UTIL_SLOPE_BPS: Int = 700;
const POOL_BORROW_MIN_APR_BPS: Int = 1200;
const POOL_BORROW_MAX_APR_BPS: Int = 2400;
const POOL_REWARD_SHARE_BPS: Int = 7000;

message SetLoanManager {
    loanManager: Address;
}

message SetPoolCap {
    poolCap: Int as coins;
}

message SetPaused {
    paused: Bool;
}

message DepositLiquidity {
    tier: Int;
}

message WithdrawLiquidity {}

message BorrowTo {
    to: Address;
    amount: Int as coins;
}

message RepayFromLoan {
    principalRepaid: Int as coins;
    interestPaid: Int as coins;
    penaltyPaid: Int as coins;
}

struct PoolState {
    paused: Bool;
    poolCap: Int as coins;
    totalLiquidity: Int as coins;
    totalBorrowed: Int as coins;
    rewardTreasury: Int as coins;
    reserveBalance: Int as coins;
    currentBorrowAprBps: Int;
}

struct LpPosition {
    principal: Int as coins;
    tier: Int;
    unlockAt: Int;
    lastAccrualAt: Int;
    pendingReward: Int as coins;
}

contract TNFTLiquidityPool {
    owner: Address;
    loanManager: Address;
    paused: Bool;

    poolCap: Int as coins;
    totalLiquidity: Int as coins;
    totalBorrowed: Int as coins;
    rewardTreasury: Int as coins;
    reserveBalance: Int as coins;

    lpPrincipal: map<Address, Int>;
    lpTier: map<Address, Int>;
    lpUnlockAt: map<Address, Int>;
    lpLastAccrualAt: map<Address, Int>;
    lpPendingReward: map<Address, Int>;

    init(owner: Address, loanManager: Address, poolCap: Int as coins) {
        require(poolCap > 0, "pool cap must be positive");
        self.owner = owner;
        self.loanManager = loanManager;
        self.paused = false;
        self.poolCap = poolCap;
        self.totalLiquidity = 0;
        self.totalBorrowed = 0;
        self.rewardTreasury = 0;
        self.reserveBalance = 0;
        self.lpPrincipal = emptyMap();
        self.lpTier = emptyMap();
        self.lpUnlockAt = emptyMap();
        self.lpLastAccrualAt = emptyMap();
        self.lpPendingReward = emptyMap();
    }

    receive(msg: SetLoanManager) {
        self.requireOwner();
        self.loanManager = msg.loanManager;
    }

    receive(msg: SetPoolCap) {
        self.requireOwner();
        require(msg.poolCap >= self.totalLiquidity, "pool cap below current liquidity");
        self.poolCap = msg.poolCap;
    }

    receive(msg: SetPaused) {
        self.requireOwner();
        self.paused = msg.paused;
    }

    receive(msg: DepositLiquidity) {
        require(!self.paused, "pool paused");
        require(msg.tier >= 0 && msg.tier <= 4, "invalid tier");
        let amount: Int = context().value;
        require(amount > 0, "empty deposit");
        require(self.totalLiquidity + amount <= self.poolCap, "pool cap exceeded");

        let principalNow: Int = self.getLpPrincipal(sender());
        let tierNow: Int = self.getLpTier(sender());
        let pendingNow: Int = self.getLpPendingReward(sender());
        let lastNow: Int = self.getLpLastAccrualAt(sender());
        let unlockNow: Int = self.getLpUnlockAt(sender());

        if (principalNow > 0) {
            require(tierNow == msg.tier, "tier mismatch");
            let freshReward: Int = self.computeLpReward(principalNow, tierNow, lastNow, now());
            self.lpPendingReward.set(sender(), pendingNow + freshReward);
            self.lpPrincipal.set(sender(), principalNow + amount);
            self.lpLastAccrualAt.set(sender(), now());

            let lockTarget: Int = now() + self.lockSecondsForTier(msg.tier);
            if (lockTarget > unlockNow) {
                self.lpUnlockAt.set(sender(), lockTarget);
            }
        } else {
            self.lpPrincipal.set(sender(), amount);
            self.lpTier.set(sender(), msg.tier);
            self.lpUnlockAt.set(sender(), now() + self.lockSecondsForTier(msg.tier));
            self.lpLastAccrualAt.set(sender(), now());
            self.lpPendingReward.set(sender(), 0);
        }

        self.totalLiquidity = self.totalLiquidity + amount;
    }

    receive(msg: WithdrawLiquidity) {
        let _ = msg;
        let principalNow: Int = self.getLpPrincipal(sender());
        require(principalNow > 0, "no LP position");
        require(now() >= self.getLpUnlockAt(sender()), "position is locked");
        require(self.availableLiquidity() >= principalNow, "insufficient free liquidity");

        let tierNow: Int = self.getLpTier(sender());
        let pendingNow: Int = self.getLpPendingReward(sender());
        let freshReward: Int = self.computeLpReward(principalNow, tierNow, self.getLpLastAccrualAt(sender()), now());
        let rewardDue: Int = pendingNow + freshReward;
        let rewardPaid: Int = self.minInt(rewardDue, self.rewardTreasury);

        self.rewardTreasury = self.rewardTreasury - rewardPaid;
        self.totalLiquidity = self.totalLiquidity - principalNow;

        self.lpPrincipal.set(sender(), null);
        self.lpTier.set(sender(), null);
        self.lpUnlockAt.set(sender(), null);
        self.lpLastAccrualAt.set(sender(), null);
        self.lpPendingReward.set(sender(), null);

        send(SendParameters{
            to: sender(),
            value: principalNow + rewardPaid,
            mode: SendDefaultMode,
            bounce: true
        });
    }

    receive(msg: BorrowTo) {
        require(sender() == self.loanManager, "only loan manager");
        require(!self.paused, "pool paused");
        require(msg.amount > 0, "invalid borrow amount");
        require(self.availableLiquidity() >= msg.amount, "insufficient liquidity");

        self.totalBorrowed = self.totalBorrowed + msg.amount;

        send(SendParameters{
            to: msg.to,
            value: msg.amount,
            mode: SendDefaultMode,
            bounce: true
        });
    }

    receive(msg: RepayFromLoan) {
        require(sender() == self.loanManager, "only loan manager");
        let expected: Int = msg.principalRepaid + msg.interestPaid + msg.penaltyPaid;
        require(context().value >= expected, "insufficient repay value");
        require(msg.principalRepaid > 0, "invalid principal repay");

        if (self.totalBorrowed >= msg.principalRepaid) {
            self.totalBorrowed = self.totalBorrowed - msg.principalRepaid;
        } else {
            self.totalBorrowed = 0;
        }

        let rewardShare: Int = self.mulDivDown(msg.interestPaid, POOL_REWARD_SHARE_BPS, POOL_BPS_DENOMINATOR);
        let reserveShare: Int = msg.interestPaid - rewardShare;
        self.rewardTreasury = self.rewardTreasury + rewardShare;
        self.reserveBalance = self.reserveBalance + reserveShare + msg.penaltyPaid;

        let refund: Int = context().value - expected;
        if (refund > 0) {
            send(SendParameters{
                to: sender(),
                value: refund,
                mode: SendIgnoreErrors,
                bounce: false
            });
        }
    }

    get fun get_pool_state(): PoolState {
        return PoolState{
            paused: self.paused,
            poolCap: self.poolCap,
            totalLiquidity: self.totalLiquidity,
            totalBorrowed: self.totalBorrowed,
            rewardTreasury: self.rewardTreasury,
            reserveBalance: self.reserveBalance,
            currentBorrowAprBps: self.currentBorrowAprBps()
        };
    }

    get fun get_lp_position(of: Address): LpPosition {
        return LpPosition{
            principal: self.getLpPrincipal(of),
            tier: self.getLpTier(of),
            unlockAt: self.getLpUnlockAt(of),
            lastAccrualAt: self.getLpLastAccrualAt(of),
            pendingReward: self.getLpPendingReward(of)
        };
    }

    get fun get_available_liquidity(): Int {
        return self.availableLiquidity();
    }

    fun requireOwner() {
        require(sender() == self.owner, "only owner");
    }

    fun minInt(a: Int, b: Int): Int {
        if (a < b) {
            return a;
        }
        return b;
    }

    fun maxInt(a: Int, b: Int): Int {
        if (a > b) {
            return a;
        }
        return b;
    }

    fun mulDivDown(value: Int, numerator: Int, denominator: Int): Int {
        return (value * numerator) / denominator;
    }

    fun availableLiquidity(): Int {
        if (self.totalLiquidity <= self.totalBorrowed) {
            return 0;
        }
        return self.totalLiquidity - self.totalBorrowed;
    }

    fun currentBorrowAprBps(): Int {
        let base: Int = POOL_BORROW_BASE_APR_BPS;
        if (self.totalLiquidity <= 0) {
            return base;
        }

        let utilBps: Int = self.mulDivDown(self.totalBorrowed, POOL_BPS_DENOMINATOR, self.totalLiquidity);
        let utilAdj: Int = self.mulDivDown(utilBps, POOL_BORROW_UTIL_SLOPE_BPS, POOL_BPS_DENOMINATOR);
        let apr: Int = base + utilAdj;

        if (apr < POOL_BORROW_MIN_APR_BPS) {
            return POOL_BORROW_MIN_APR_BPS;
        }
        if (apr > POOL_BORROW_MAX_APR_BPS) {
            return POOL_BORROW_MAX_APR_BPS;
        }
        return apr;
    }

    fun lockSecondsForTier(tier: Int): Int {
        if (tier == 0) {
            return 0;
        }
        if (tier == 1) {
            return 30 * 24 * 60 * 60;
        }
        if (tier == 2) {
            return 90 * 24 * 60 * 60;
        }
        if (tier == 3) {
            return 180 * 24 * 60 * 60;
        }
        return 365 * 24 * 60 * 60;
    }

    fun aprForTier(tier: Int): Int {
        if (tier == 0) {
            return 500;
        }
        if (tier == 1) {
            return 610;
        }
        if (tier == 2) {
            return 720;
        }
        if (tier == 3) {
            return 820;
        }
        return 950;
    }

    fun computeLpReward(principal: Int, tier: Int, fromTs: Int, toTs: Int): Int {
        if (principal <= 0 || fromTs <= 0 || toTs <= fromTs) {
            return 0;
        }
        let aprBps: Int = self.aprForTier(tier);
        let dt: Int = toTs - fromTs;
        return self.mulDivDown(
            self.mulDivDown(principal, aprBps, POOL_BPS_DENOMINATOR),
            dt,
            POOL_YEAR_SECONDS
        );
    }

    fun getLpPrincipal(addr: Address): Int {
        let v: Int? = self.lpPrincipal.get(addr);
        if (v == null) {
            return 0;
        }
        return v!!;
    }

    fun getLpTier(addr: Address): Int {
        let v: Int? = self.lpTier.get(addr);
        if (v == null) {
            return 0;
        }
        return v!!;
    }

    fun getLpUnlockAt(addr: Address): Int {
        let v: Int? = self.lpUnlockAt.get(addr);
        if (v == null) {
            return 0;
        }
        return v!!;
    }

    fun getLpLastAccrualAt(addr: Address): Int {
        let v: Int? = self.lpLastAccrualAt.get(addr);
        if (v == null) {
            return 0;
        }
        return v!!;
    }

    fun getLpPendingReward(addr: Address): Int {
        let v: Int? = self.lpPendingReward.get(addr);
        if (v == null) {
            return 0;
        }
        return v!!;
    }
}
