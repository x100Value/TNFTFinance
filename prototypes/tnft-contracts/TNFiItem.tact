// TNFiItem.tact - Minimal NFT item contract prototype
import "@stdlib/deploy";

message Deploy {}

message Transfer {
    query_id: Int;
    new_owner: Address;
    response_destination: Address;
    forward_payload: Cell;
    forward_amount: Int as coins;
}

message OwnershipTransferred {
    prev_owner: Address;
    new_owner: Address;
}

contract TNFiItem with Deploy {
    index: Int;
    collection: Address;
    owner: Address;
    content: Cell;

    init(index: Int, collection: Address, owner: Address, content: Cell) {
        self.index = index;
        self.collection = collection;
        self.owner = owner;
        self.content = content;
    }

    view get_nft_data(): (Int, Address, Address, Cell) {
        return (self.index, self.collection, self.owner, self.content);
    }

    view get_nft_address(): Address {
        return self.address;
    }

    receive(msg: Transfer) {
        require(self.owner == sender(), "Only owner can transfer");

        let prevOwner: Address = self.owner;
        self.owner = msg.new_owner;

        if (msg.response_destination != self.address) {
            send(SendParameters{
                to: msg.response_destination,
                value: 0,
                mode: SendIgnoreErrors,
                bounce: true
            });
        }

        send(SendParameters{
            to: self.owner,
            value: 0,
            mode: SendIgnoreErrors,
            body: OwnershipTransferred{prev_owner: prevOwner, new_owner: self.owner}.toCell(),
            bounce: true
        });

        if (!msg.forward_payload.isEmpty()) {
            send(SendParameters{
                to: self.owner,
                value: msg.forward_amount,
                mode: SendIgnoreErrors,
                body: msg.forward_payload,
                bounce: true
            });
        }
    }
}