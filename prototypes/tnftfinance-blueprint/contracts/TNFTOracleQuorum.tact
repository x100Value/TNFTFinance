const ORACLE_BPS_DENOMINATOR: Int = 10000;
const ORACLE_MAX_AGE_HARD: Int = 30 * 60;
const ORACLE_MAX_DEVIATION_HARD: Int = 2500;

message SetOracleSource {
    slot: Int;
    source: Address;
}

message SubmitOraclePrice {
    price: Int as coins;
    updatedAt: Int;
}

message SetOracleParams {
    maxAge: Int;
    maxDeviationBps: Int;
}

message SetManualFallback {
    price: Int as coins;
    updatedAt: Int;
}

message SetManualFallbackEnabled {
    enabled: Bool;
}

struct OracleQuorumState {
    source1: Address;
    source2: Address;
    source3: Address;
    price1: Int as coins;
    price2: Int as coins;
    price3: Int as coins;
    ts1: Int;
    ts2: Int;
    ts3: Int;
    maxAge: Int;
    maxDeviationBps: Int;
    manualFallbackPrice: Int as coins;
    manualFallbackTs: Int;
    manualFallbackEnabled: Bool;
}

contract TNFTOracleQuorum {
    owner: Address;

    source1: Address;
    source2: Address;
    source3: Address;

    price1: Int as coins;
    price2: Int as coins;
    price3: Int as coins;

    ts1: Int;
    ts2: Int;
    ts3: Int;

    maxAge: Int;
    maxDeviationBps: Int;
    manualFallbackEnabled: Bool;
    manualFallbackPrice: Int as coins;
    manualFallbackTs: Int;

    init(owner: Address, source1: Address, source2: Address, source3: Address) {
        self.owner = owner;
        self.source1 = source1;
        self.source2 = source2;
        self.source3 = source3;
        self.price1 = 0;
        self.price2 = 0;
        self.price3 = 0;
        self.ts1 = 0;
        self.ts2 = 0;
        self.ts3 = 0;
        self.maxAge = 10 * 60;
        self.maxDeviationBps = 1200;
        self.manualFallbackEnabled = false;
        self.manualFallbackPrice = 0;
        self.manualFallbackTs = 0;
    }

    receive(msg: SetOracleSource) {
        self.requireOwner();
        require(msg.slot >= 1 && msg.slot <= 3, "invalid slot");

        if (msg.slot == 1) {
            self.source1 = msg.source;
            return;
        }
        if (msg.slot == 2) {
            self.source2 = msg.source;
            return;
        }
        self.source3 = msg.source;
    }

    receive(msg: SubmitOraclePrice) {
        require(msg.price > 0, "invalid price");
        require(msg.updatedAt <= now(), "timestamp in future");

        if (sender() == self.source1) {
            require(msg.updatedAt >= self.ts1, "rollback s1");
            self.price1 = msg.price;
            self.ts1 = msg.updatedAt;
            return;
        }
        if (sender() == self.source2) {
            require(msg.updatedAt >= self.ts2, "rollback s2");
            self.price2 = msg.price;
            self.ts2 = msg.updatedAt;
            return;
        }
        if (sender() == self.source3) {
            require(msg.updatedAt >= self.ts3, "rollback s3");
            self.price3 = msg.price;
            self.ts3 = msg.updatedAt;
            return;
        }

        throw(101);
    }

    receive(msg: SetOracleParams) {
        self.requireOwner();
        require(msg.maxAge > 0 && msg.maxAge <= ORACLE_MAX_AGE_HARD, "invalid maxAge");
        require(msg.maxDeviationBps > 0 && msg.maxDeviationBps <= ORACLE_MAX_DEVIATION_HARD, "invalid maxDeviation");
        self.maxAge = msg.maxAge;
        self.maxDeviationBps = msg.maxDeviationBps;
    }

    receive(msg: SetManualFallback) {
        self.requireOwner();
        require(msg.price > 0, "invalid fallback price");
        require(msg.updatedAt <= now(), "fallback timestamp in future");
        self.manualFallbackPrice = msg.price;
        self.manualFallbackTs = msg.updatedAt;
    }

    receive(msg: SetManualFallbackEnabled) {
        self.requireOwner();
        self.manualFallbackEnabled = msg.enabled;
    }

    get fun get_oracle_state(): OracleQuorumState {
        return OracleQuorumState{
            source1: self.source1,
            source2: self.source2,
            source3: self.source3,
            price1: self.price1,
            price2: self.price2,
            price3: self.price3,
            ts1: self.ts1,
            ts2: self.ts2,
            ts3: self.ts3,
            maxAge: self.maxAge,
            maxDeviationBps: self.maxDeviationBps,
            manualFallbackPrice: self.manualFallbackPrice,
            manualFallbackTs: self.manualFallbackTs,
            manualFallbackEnabled: self.manualFallbackEnabled
        };
    }

    get fun get_effective_price(): Int {
        return self.getEffectivePrice();
    }

    get fun get_has_quorum(): Bool {
        return self.getEffectivePrice() > 0;
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

    fun freshPrice(price: Int, updatedAt: Int): Int {
        if (price <= 0) {
            return 0;
        }
        if (updatedAt <= 0 || updatedAt > now()) {
            return 0;
        }
        if ((now() - updatedAt) > self.maxAge) {
            return 0;
        }
        return price;
    }

    fun getEffectivePrice(): Int {
        let p1: Int = self.freshPrice(self.price1, self.ts1);
        let p2: Int = self.freshPrice(self.price2, self.ts2);
        let p3: Int = self.freshPrice(self.price3, self.ts3);

        let c1: Int = p1 > 0 ? 1 : 0;
        let c2: Int = p2 > 0 ? 1 : 0;
        let c3: Int = p3 > 0 ? 1 : 0;
        let count: Int = c1 + c2 + c3;

        if (count < 2) {
            if (self.manualFallbackEnabled) {
                return self.freshPrice(self.manualFallbackPrice, self.manualFallbackTs);
            }
            return 0;
        }

        if (count == 2) {
            if (p1 == 0) {
                let min23: Int = self.minInt(p2, p3);
                let max23: Int = self.maxInt(p2, p3);
                let spread23: Int = self.mulDivDown(max23 - min23, ORACLE_BPS_DENOMINATOR, max23);
                if (spread23 > self.maxDeviationBps) {
                    return 0;
                }
                return min23;
            }
            if (p2 == 0) {
                let min13: Int = self.minInt(p1, p3);
                let max13: Int = self.maxInt(p1, p3);
                let spread13: Int = self.mulDivDown(max13 - min13, ORACLE_BPS_DENOMINATOR, max13);
                if (spread13 > self.maxDeviationBps) {
                    return 0;
                }
                return min13;
            }
            let min12: Int = self.minInt(p1, p2);
            let max12: Int = self.maxInt(p1, p2);
            let spread12: Int = self.mulDivDown(max12 - min12, ORACLE_BPS_DENOMINATOR, max12);
            if (spread12 > self.maxDeviationBps) {
                return 0;
            }
            return min12;
        }

        let minP: Int = self.minInt(self.minInt(p1, p2), p3);
        let maxP: Int = self.maxInt(self.maxInt(p1, p2), p3);
        let spread: Int = self.mulDivDown(maxP - minP, ORACLE_BPS_DENOMINATOR, maxP);
        if (spread > self.maxDeviationBps) {
            return 0;
        }

        return p1 + p2 + p3 - minP - maxP;
    }
}
