import * as child_process from 'child_process';
import * as fs from 'fs';

async function compileContract() {
    console.log("-> Запуск компиляции TNFiMaster.tact через Tact CLI...");
    
    if (!fs.existsSync('build')) {
        fs.mkdirSync('build');
    }
    
    try {
        // Вызываем Tact Compiler и ЗАХВАТЫВАЕМ вывод
        const result = child_process.spawnSync(
            'npx', 
            ['tact', 'TNFiMaster.tact', '--output', 'build'], 
            { 
                encoding: 'utf-8', 
                // Не используем 'inherit', чтобы получить вывод в виде строки
            }
        );

        // Проверяем статус
        if (result.status === 0) {
            console.log("\n✅ Компиляция успешно завершена!");
        } else {
            console.error("\n❌ Компиляция завершилась с ошибкой.");
            
            // Выводим stderr (ошибки) и stdout (предупреждения)
            if (result.stdout) {
                console.log("\n--- STDOUT (Предупреждения) ---");
                console.log(result.stdout);
            }
            if (result.stderr) {
                console.log("\n--- STDERR (ОШИБКИ Tact) ---");
                console.error(result.stderr);
            }
        }

    } catch (e) {
        console.error("❌ Критическая ошибка TypeScript/Node:", e);
    }
}

compileContract();