// Configuration file for the Expense Tracker App
// Copy this file to config.js and update with your actual API credentials

const CONFIG = {
    // Google Drive API Configuration
    GOOGLE_API_KEY: 'YOUR_GOOGLE_API_KEY_HERE',
    GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID_HERE.googleusercontent.com',
    
    // Application Settings
    APP_NAME: 'ExpenseTracker',
    VERSION: '1.0.0',
    
    // Default Settings
    DEFAULT_CURRENCY: 'USD',
    DEFAULT_THEME: 'light',
    
    // Categories Configuration
    CATEGORIES: {
        food: { name: 'Food', icon: '🍕', color: '#FF6384' },
        transport: { name: 'Transport', icon: '🚗', color: '#36A2EB' },
        shopping: { name: 'Shopping', icon: '🛒', color: '#FFCE56' },
        entertainment: { name: 'Entertainment', icon: '🎬', color: '#4BC0C0' },
        bills: { name: 'Bills', icon: '💡', color: '#9966FF' },
        health: { name: 'Health', icon: '🏥', color: '#FF9F40' },
        income: { name: 'Income', icon: '💰', color: '#4CAF50' },
        other: { name: 'Other', icon: '📋', color: '#C9CBCF' }
    },
    
    // Chart Configuration
    CHART_CONFIG: {
        colors: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
            '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
        ],
        animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
        }
    },
    
    // Sync Settings
    SYNC_SETTINGS: {
        autoSync: true,
        syncInterval: 300000, // 5 minutes
        retryAttempts: 3,
        retryDelay: 2000 // 2 seconds
    },
    
    // UI Settings
    UI_SETTINGS: {
        toastDuration: 3000,
        animationDuration: 300,
        itemsPerPage: 20,
        dateFormat: 'en-US',
        numberFormat: 'en-US'
    }
};

// Export configuration if using modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}

// Make available globally
window.CONFIG = CONFIG;