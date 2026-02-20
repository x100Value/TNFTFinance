import React, { useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Главный экран Mini App
const HomeScreen: React.FC = () => {
    const [userName, setUserName] = useState('Гость');

    useEffect(() => {
        // Получаем имя пользователя из TWA SDK
        if (WebApp.initDataUnsafe.user) {
            setUserName(WebApp.initDataUnsafe.user.first_name || 'Пользователь');
        }

        // Настраиваем тему Mini App
        WebApp.setHeaderColor('bg_color'); 
        WebApp.setBackgroundColor('bg_color'); 
        
        // Настраиваем основную кнопку (Main Button)
        WebApp.MainButton.setText('Посмотреть возможности');
        WebApp.MainButton.show();
        
        // Привязываем действие к кнопке
        const handleMainButtonClick = () => {
            // В реальном приложении здесь будет навигация или действие
            WebApp.showAlert('Кнопка нажата! Начнем разработку функционала TNFi.');
        };

        WebApp.MainButton.onClick(handleMainButtonClick);

        return () => {
            WebApp.MainButton.offClick(handleMainButtonClick);
        };
    }, []);

    const textColor = WebApp.themeParams.text_color || '#000000';

    return (
        <div style={{ padding: '20px', color: textColor, background: WebApp.themeParams.bg_color }}>
            <h2>👋 Добро пожаловать, {userName}!</h2>
            <p>Это Mini App для проекта **T-NFT Finance (TNFi)**.</p>
            <p>Текущий статус: **Интерфейс инициализирован**.</p>
            
            <nav style={{ marginTop: '20px' }}>
                <Link to="/staking" style={{ color: WebApp.themeParams.link_color || '#2196F3', marginRight: '15px' }}>
                    Перейти к Стейкингу
                </Link>
                <Link to="/about" style={{ color: WebApp.themeParams.link_color || '#2196F3' }}>
                    О проекте
                </Link>
            </nav>
        </div>
    );
};

// Простые заглушки для других страниц
const StakingScreen = () => <div style={{ padding: '20px' }}><h2>Стейкинг LP</h2><p>Здесь будет логика стейкинга.</p><Link to="/">Назад</Link></div>;
const AboutScreen = () => <div style={{ padding: '20px' }}><h2>О проекте TNFi</h2><p>Подробное описание проекта.</p><Link to="/">Назад</Link></div>;


function App() {
  // Используем React Router для навигации
  return (
    <Router>
        <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/staking" element={<StakingScreen />} />
            <Route path="/about" element={<AboutScreen />} />
        </Routes>
    </Router>
  );
}

export default App;