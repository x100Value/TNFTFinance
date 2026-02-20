// TNFiItem.tact - Minimal NFT item contract prototype
import "@stdlib/deploy";

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

struct NftData {
    index: Int;
    collection: Address;
    owner: Address;
    content: Cell;
}

contract TNFiItem {
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

    get fun get_nft_data(): NftData {
        return NftData{
            index: self.index,
            collection: self.collection,
            owner: self.owner,
            content: self.content
        };
    }

    get fun get_nft_address(): Address {
        return myAddress();
    }

    receive(msg: Transfer) {
        require(self.owner == sender(), "Only owner can transfer");

        let prevOwner: Address = self.owner;
        self.owner = msg.new_owner;

        if (msg.response_destination != myAddress()) {
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

        send(SendParameters{
            to: self.owner,
            value: msg.forward_amount,
            mode: SendIgnoreErrors,
            body: msg.forward_payload,
            bounce: true
        });
    }
}
