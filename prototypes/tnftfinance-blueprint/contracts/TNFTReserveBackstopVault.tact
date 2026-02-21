message SetAuthorizedManager {
    manager: Address;
    enabled: Bool;
}

message TopUpReserve {}
message TopUpBackstop {}

message RequestCoverage {
    amount: Int as coins;
    to: Address;
}

message WithdrawReserve {
    amount: Int as coins;
    to: Address;
}

message WithdrawBackstop {
    amount: Int as coins;
    to: Address;
}

struct ReserveState {
    reserveBalance: Int as coins;
    backstopBalance: Int as coins;
    badDebtTotal: Int as coins;
}

contract TNFTReserveBackstopVault {
    owner: Address;
    authorizedManagers: map<Address, Bool>;
    reserveBalance: Int as coins;
    backstopBalance: Int as coins;
    badDebtTotal: Int as coins;

    init(owner: Address) {
        self.owner = owner;
        self.authorizedManagers = emptyMap();
        self.reserveBalance = 0;
        self.backstopBalance = 0;
        self.badDebtTotal = 0;
    }

    receive(msg: SetAuthorizedManager) {
        self.requireOwner();
        self.authorizedManagers.set(msg.manager, msg.enabled);
    }

    receive(msg: TopUpReserve) {
        let _ = msg;
        let amount: Int = context().value;
        require(amount > 0, "empty topup");
        self.reserveBalance = self.reserveBalance + amount;
    }

    receive(msg: TopUpBackstop) {
        let _ = msg;
        let amount: Int = context().value;
        require(amount > 0, "empty topup");
        self.backstopBalance = self.backstopBalance + amount;
    }

    receive(msg: RequestCoverage) {
        require(self.isAuthorized(sender()), "not authorized manager");
        require(msg.amount > 0, "invalid coverage amount");

        let fromReserve: Int = self.minInt(msg.amount, self.reserveBalance);
        self.reserveBalance = self.reserveBalance - fromReserve;

        let afterReserve: Int = msg.amount - fromReserve;
        let fromBackstop: Int = self.minInt(afterReserve, self.backstopBalance);
        self.backstopBalance = self.backstopBalance - fromBackstop;

        let covered: Int = fromReserve + fromBackstop;
        let uncovered: Int = msg.amount - covered;
        if (uncovered > 0) {
            self.badDebtTotal = self.badDebtTotal + uncovered;
        }

        if (covered > 0) {
            send(SendParameters{
                to: msg.to,
                value: covered,
                mode: SendDefaultMode,
                bounce: true
            });
        }
    }

    receive(msg: WithdrawReserve) {
        self.requireOwner();
        require(msg.amount > 0, "invalid amount");
        require(msg.amount <= self.reserveBalance, "insufficient reserve");
        self.reserveBalance = self.reserveBalance - msg.amount;

        send(SendParameters{
            to: msg.to,
            value: msg.amount,
            mode: SendDefaultMode,
            bounce: true
        });
    }

    receive(msg: WithdrawBackstop) {
        self.requireOwner();
        require(msg.amount > 0, "invalid amount");
        require(msg.amount <= self.backstopBalance, "insufficient backstop");
        self.backstopBalance = self.backstopBalance - msg.amount;

        send(SendParameters{
            to: msg.to,
            value: msg.amount,
            mode: SendDefaultMode,
            bounce: true
        });
    }

    get fun get_reserve_state(): ReserveState {
        return ReserveState{
            reserveBalance: self.reserveBalance,
            backstopBalance: self.backstopBalance,
            badDebtTotal: self.badDebtTotal
        };
    }

    get fun get_is_manager_authorized(manager: Address): Bool {
        let flag: Bool? = self.authorizedManagers.get(manager);
        if (flag == null) {
            return false;
        }
        return flag!!;
    }

    fun requireOwner() {
        require(sender() == self.owner, "only owner");
    }

    fun isAuthorized(addr: Address): Bool {
        let flag: Bool? = self.authorizedManagers.get(addr);
        if (flag == null) {
            return false;
        }
        return flag!!;
    }

    fun minInt(a: Int, b: Int): Int {
        if (a < b) {
            return a;
        }
        return b;
    }
}
