message ProposeRiskUpdate {
    nextMaxLtvBps: Int;
    nextOracleMaxAge: Int;
}

message ApproveRiskUpdate {}
message ApplyRiskUpdate {}

struct RiskMultisigState {
    signer1: Address;
    signer2: Address;
    signer3: Address;
    maxLtvBps: Int;
    oracleMaxAge: Int;
    pendingMaxLtvBps: Int;
    pendingOracleMaxAge: Int;
    pendingEta: Int;
    approvals: Int;
    riskVersion: Int;
}

contract TNFTRiskMultisig {
    signer1: Address;
    signer2: Address;
    signer3: Address;

    maxLtvBps: Int;
    oracleMaxAge: Int;
    timelockSeconds: Int;

    pendingMaxLtvBps: Int;
    pendingOracleMaxAge: Int;
    pendingEta: Int;
    approved1: Bool;
    approved2: Bool;
    approved3: Bool;
    riskVersion: Int;

    init(
        signer1: Address,
        signer2: Address,
        signer3: Address,
        maxLtvBps: Int,
        oracleMaxAge: Int,
        timelockSeconds: Int
    ) {
        require(maxLtvBps > 0, "invalid maxLtvBps");
        require(oracleMaxAge > 0, "invalid oracleMaxAge");
        require(timelockSeconds >= 24 * 60 * 60, "timelock too short");

        self.signer1 = signer1;
        self.signer2 = signer2;
        self.signer3 = signer3;
        self.maxLtvBps = maxLtvBps;
        self.oracleMaxAge = oracleMaxAge;
        self.timelockSeconds = timelockSeconds;
        self.pendingMaxLtvBps = 0;
        self.pendingOracleMaxAge = 0;
        self.pendingEta = 0;
        self.approved1 = false;
        self.approved2 = false;
        self.approved3 = false;
        self.riskVersion = 1;
    }

    receive(msg: ProposeRiskUpdate) {
        self.requireSigner(sender());
        require(msg.nextMaxLtvBps > 0, "invalid next maxLtvBps");
        require(msg.nextOracleMaxAge > 0, "invalid next oracleMaxAge");

        self.pendingMaxLtvBps = msg.nextMaxLtvBps;
        self.pendingOracleMaxAge = msg.nextOracleMaxAge;
        self.pendingEta = now() + self.timelockSeconds;
        self.approved1 = false;
        self.approved2 = false;
        self.approved3 = false;
        self.recordApproval(sender());
    }

    receive(msg: ApproveRiskUpdate) {
        let _ = msg;
        require(self.pendingEta > 0, "no pending update");
        self.requireSigner(sender());
        self.recordApproval(sender());
    }

    receive(msg: ApplyRiskUpdate) {
        let _ = msg;
        require(self.pendingEta > 0, "no pending update");
        require(now() >= self.pendingEta, "timelock active");
        require(self.approvalCount() >= 2, "need 2-of-3 approvals");

        self.maxLtvBps = self.pendingMaxLtvBps;
        self.oracleMaxAge = self.pendingOracleMaxAge;
        self.pendingMaxLtvBps = 0;
        self.pendingOracleMaxAge = 0;
        self.pendingEta = 0;
        self.approved1 = false;
        self.approved2 = false;
        self.approved3 = false;
        self.riskVersion = self.riskVersion + 1;
    }

    get fun get_risk_multisig_state(): RiskMultisigState {
        return RiskMultisigState{
            signer1: self.signer1,
            signer2: self.signer2,
            signer3: self.signer3,
            maxLtvBps: self.maxLtvBps,
            oracleMaxAge: self.oracleMaxAge,
            pendingMaxLtvBps: self.pendingMaxLtvBps,
            pendingOracleMaxAge: self.pendingOracleMaxAge,
            pendingEta: self.pendingEta,
            approvals: self.approvalCount(),
            riskVersion: self.riskVersion
        };
    }

    fun requireSigner(addr: Address) {
        require(
            addr == self.signer1 || addr == self.signer2 || addr == self.signer3,
            "only signer"
        );
    }

    fun recordApproval(addr: Address) {
        if (addr == self.signer1) {
            self.approved1 = true;
        }
        if (addr == self.signer2) {
            self.approved2 = true;
        }
        if (addr == self.signer3) {
            self.approved3 = true;
        }
    }

    fun approvalCount(): Int {
        let a1: Int = self.approved1 ? 1 : 0;
        let a2: Int = self.approved2 ? 1 : 0;
        let a3: Int = self.approved3 ? 1 : 0;
        return a1 + a2 + a3;
    }
}
