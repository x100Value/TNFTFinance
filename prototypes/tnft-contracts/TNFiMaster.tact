// Минимальный шаблон контракта TNFiMaster.tact
// Импорты: достаточно @stdlib/deploy для Address, Cell, Int
import "@stdlib/deploy";
import "./TNFiItem.tact"; // Импорт кода NFT-предмета

// --- КОНСТАНТЫ: ВЛАДЕЛЕЦ И КЛЮЧИ ---

// Адрес Владельца (Ваш НОВЫЙ кошелек Testnet)
const OWNER_ADDRESS: Address = Address.parse("0:41242055e8ff9935f875866183970a2d049f8b498b4ad39e97c949f5795f7a41"); 

// Публичный ключ Владельца 
const OWNER_PUBLIC_KEY: Int = 0xc22e188b3e31a183723232edf0718fcf9a6bbf54e299b52a25deb2e1d35bbafc;

// --- ССЫЛКИ НА ДРУГИЕ КОНТРАКТЫ ---
const TREASURY_ADDRESS: Address = OWNER_ADDRESS; 
const DAO_ADDRESS: Address = OWNER_ADDRESS; 


// --- ХРАНИЛИЩЕ КОНТРАКТА (Storage) ---
message Deploy {}

contract TNFiMaster with Deploy {
    owner: Address;
    next_item_index: Int;
    nft_item_code: Cell; // Код контракта NFT-предмета
    
    init(nft_code: Cell) {
        self.owner = OWNER_ADDRESS; // Устанавливаем владельца из константы
        self.next_item_index = 0;
        self.nft_item_code = nft_code;
    }
    
    // --- ГЕТ-МЕТОДЫ ---
    
    // Метод для получения данных коллекции (ИСПРАВЛЕНО: добавлен пробел)
    get get_collection_data(): (Int, Address, Address, Address, Cell) {
        return (self.next_item_index, self.owner, self.address, TREASURY_ADDRESS, self.nft_item_code);
    }
    
    // Метод для вычисления адреса NFT-предмета (ИСПРАВЛЕНО: добавлен пробел)
    // Используем стандартную функцию calculate_nft_address, которая доступна благодаря @stdlib/deploy
    get get_nft_address_by_index(item_index: Int): Address {
        return calculate_nft_address(
            self.nft_item_code,
            self.address,
            item_index
        );
    }
    
    // --- ПРИЕМ ВХОДЯЩИХ СООБЩЕНИЙ ---
    
    // Метод для чеканки NFT (Mint)
    receive("mint") {
        require(sender() == self.owner, "Only the owner can mint.");
        
        // В реальном коде здесь должна быть логика создания и отправки NFT Item Contract
        self.next_item_index = self.next_item_index + 1;
    }

    // Метод для обновления кода коллекции (только владелец)
    receive("update_code") {
        require(sender() == self.owner, "Only the owner can update code.");
        // Здесь должна быть логика обновления кода контракта
    }
}
