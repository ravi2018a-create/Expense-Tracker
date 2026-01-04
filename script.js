// Google Drive API Configuration
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

// App State
let gapi;
let google;
let isGapiLoaded = false;
let isGsiLoaded = false;
let currentUser = null;
let transactions = [];
let currentView = 'daily';
let expenseChart = null;
let currentEditingId = null;
let currentUserId = null; // Add user ID tracking

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    checkOrCreateUser(); // Check for existing user or create new one
    loadTransactions();
    updateUI();
    setCurrentDate();
    
    // Show welcome message
    setTimeout(() => {
        const userName = localStorage.getItem('userName') || 'User';
        showToast(`Welcome ${userName}! Your expenses are private and saved securely.`, 'success');
    }, 2000);
    
    // Try to initialize Google APIs after a short delay
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 1000);
});

// User management for multiple users
function checkOrCreateUser() {
    currentUserId = localStorage.getItem('userId');
    
    if (!currentUserId) {
        // New user - create account
        createNewUser();
    } else {
        // Existing user - load their data
        loadUserProfile();
    }
}

function createNewUser() {
    // Generate unique user ID
    currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Ask for user name
    const userName = prompt('Welcome! Please enter your name:') || 'User';
    
    // Save user info with proper keys
    localStorage.setItem('userId', currentUserId);
    localStorage.setItem('userName', userName);
    localStorage.setItem(`userName_${currentUserId}`, userName); // For user listing
    
    // Update UI
    updateUserDisplay();
    
    showToast(`Account created for ${userName}! Your data is private.`, 'success');
}

function loadUserProfile() {
    const userName = localStorage.getItem('userName') || 'User';
    updateUserDisplay();
}

function updateUserDisplay() {
    const userName = localStorage.getItem('userName') || 'User';
    
    // Update connection status to show current user
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        connectionStatus.innerHTML = `<small>Logged in as: ${userName}</small>`;
        connectionStatus.style.color = 'var(--success-color)';
    }
}

// Initialize Google APIs
function initializeApp() {
    // Initialize theme
    initializeTheme();
    
    // Setup demo mode if Google APIs are not available
    setupDemoMode();
}

async function initializeGapi() {
    try {
        console.log('GAPI: Loading client and auth...');
        
        if (typeof gapi === 'undefined') {
            throw new Error('Google API not loaded');
        }
        
        await new Promise((resolve, reject) => {
            gapi.load('client:auth2', {
                callback: () => {
                    console.log('GAPI: client:auth2 loaded successfully');
                    resolve();
                },
                onerror: (error) => {
                    console.error('GAPI: Failed to load client:auth2', error);
                    reject(error);
                }
            });
        });
        
        console.log('GAPI: Initializing client...');
        
        await gapi.client.init({
            apiKey: 'AIzaSyDO9vWFp9VUbyMA08Xhk1MPokh6AIEXGmI',
            discoveryDocs: [DISCOVERY_DOC],
            clientId: '605353027246-6280216bnjo0csg5vabfn67ohiumdfks.apps.googleusercontent.com',
            scope: SCOPES
        });
        
        console.log('GAPI: Client initialized successfully');
        isGapiLoaded = true;
        
        // Initialize the auth instance
        const authInstance = gapi.auth2.getAuthInstance();
        console.log('GAPI: Auth instance created');
        
        if (authInstance.isSignedIn.get()) {
            console.log('GAPI: User already signed in');
            handleAuthChange(true);
        }
        
        // Listen for auth changes
        authInstance.isSignedIn.listen(handleAuthChange);
        
        // Update UI to show Google sign-in is ready
        updateSignInButton();
        
    } catch (error) {
        console.error('GAPI initialization failed:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        showDemoModeMessage();
    }
}

// Google Sign-in initialization
function initializeGsi() {
    try {
        console.log('GSI: Starting initialization...');
        
        if (typeof google === 'undefined' || !google.accounts) {
            throw new Error('Google Identity Services not loaded');
        }
        
        console.log('GSI: Calling google.accounts.id.initialize...');
        
        google.accounts.id.initialize({
            client_id: '605353027246-6280216bnjo0csg5vabfn67ohiumdfks.apps.googleusercontent.com',
            callback: handleSignInWithGoogle,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        console.log('GSI: Rendering button...');
        
        const signInButton = document.getElementById('signInButton');
        if (signInButton) {
            google.accounts.id.renderButton(signInButton, {
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                logo_alignment: 'left',
                width: 200
            });
            console.log('GSI: Button rendered successfully');
            isGsiLoaded = true;
        } else {
            console.error('GSI: Sign-in button element not found');
        }
        
    } catch (error) {
        console.error('GSI initialization failed:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack
        });
        showDemoModeMessage();
    }
}

// Update sign-in button when GAPI is ready
function updateSignInButton() {
    const signInButton = document.getElementById('signInButton');
    if (signInButton && isGapiLoaded && !isGsiLoaded) {
        console.log('Updating sign-in button for GAPI-only mode');
        signInButton.innerHTML = '<i class="fab fa-google"></i> Sign in with Google (GAPI)';
        signInButton.style.background = 'var(--primary-gradient)';
        signInButton.addEventListener('click', function() {
            try {
                const authInstance = gapi.auth2.getAuthInstance();
                authInstance.signIn();
            } catch (error) {
                console.error('GAPI sign-in failed:', error);
                showToast('Sign-in failed. Please try again.', 'error');
            }
        });
    }
}

// Initialize Google APIs with error handling
function initializeGoogleAPIs() {
    console.log('Attempting to initialize Google APIs...');
    
    // Check if scripts loaded
    console.log('Google API available:', typeof gapi !== 'undefined');
    console.log('Google Identity available:', typeof google !== 'undefined');
    
    // Try to initialize Google APIs
    if (typeof gapi !== 'undefined') {
        console.log('Starting GAPI initialization...');
        initializeGapi();
    } else {
        console.error('Google API script not loaded');
    }
    
    if (typeof google !== 'undefined') {
        console.log('Starting GSI initialization...');
        initializeGsi();
    } else {
        console.error('Google Identity Services script not loaded');
    }
    
    // If neither API is available, show demo mode
    if (typeof gapi === 'undefined' && typeof google === 'undefined') {
        console.error('No Google APIs loaded - showing demo mode');
        showDemoModeMessage();
    }
}

// Setup demo mode when Google APIs are not available
function setupDemoMode() {
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.addEventListener('click', function() {
            // Simulate sign in for demo purposes
            showToast('Demo Mode: Google Drive sync not available. Data will be saved locally only.', 'info');
        });
    }
}

// Show demo mode message
function showDemoModeMessage() {
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.innerHTML = '<i class="fas fa-user-plus"></i> Switch User';
        signInButton.style.background = 'var(--primary-color)';
        signInButton.addEventListener('click', switchUser);
    }
    
    // Update sync status
    const syncStatus = document.getElementById('syncStatus');
    if (syncStatus) {
        syncStatus.innerHTML = '<i class="fas fa-hdd"></i> Private Storage';
        syncStatus.style.color = 'var(--success-color)';
    }
    
    // Add single download button (remove duplicate)
    addDownloadButton();
}

function switchUser() {
    const currentName = localStorage.getItem('userName') || 'User';
    const action = confirm(`Current user: ${currentName}\n\nDo you want to:\nOK = Switch to different user\nCancel = Create new user`);
    
    if (action) {
        // Switch to existing user
        const existingUsers = getAllUsers();
        if (existingUsers.length > 1) {
            showUserSelector(existingUsers);
        } else {
            alert('No other users found. Create a new user instead.');
            createNewUser();
        }
    } else {
        // Create new user
        createNewUser();
    }
}

function getAllUsers() {
    const users = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('userName_user_')) {
            const userId = key.replace('userName_', '');
            const userName = localStorage.getItem(key);
            users.push({ id: userId, name: userName });
        }
    }
    return users;
}

function showUserSelector(users) {
    const userList = users.map((user, index) => `${index + 1}. ${user.name}`).join('\n');
    const choice = prompt(`Select user:\n${userList}\n\nEnter number (1-${users.length}):`);
    
    const selectedIndex = parseInt(choice) - 1;
    if (selectedIndex >= 0 && selectedIndex < users.length) {
        const selectedUser = users[selectedIndex];
        
        // Switch to selected user
        currentUserId = selectedUser.id;
        localStorage.setItem('userId', currentUserId);
        localStorage.setItem('userName', selectedUser.name);
        
        // Reload data
        loadTransactions();
        updateUI();
        updateUserDisplay();
        
        showToast(`Switched to ${selectedUser.name}'s account`, 'success');
    }
}

function addDownloadButton() {
    const signInButton = document.getElementById('signInButton');
    if (signInButton && signInButton.parentNode) {
        // Check if download button already exists to avoid duplicates
        const existingDownload = document.getElementById('downloadButton');
        if (existingDownload) {
            return; // Don't add duplicate
        }
        
        const downloadButton = document.createElement('button');
        downloadButton.id = 'downloadButton';
        downloadButton.innerHTML = '<i class="fas fa-download"></i> Download Expenses';
        downloadButton.className = 'sign-in-btn';
        downloadButton.style.background = 'var(--success-color)';
        downloadButton.style.marginLeft = '0.5rem';
        downloadButton.addEventListener('click', exportToJSON);
        
        signInButton.parentNode.appendChild(downloadButton);
    }
}

// Handle Google Sign-in
function handleSignInWithGoogle(response) {
    try {
        if (!response.credential) {
            throw new Error('No credential received');
        }
        
        const responsePayload = decodeJwtResponse(response.credential);
        
        currentUser = {
            id: responsePayload.sub,
            name: responsePayload.name,
            email: responsePayload.email,
            picture: responsePayload.picture
        };
        
        updateUserUI();
        loadFromGoogleDrive(); // Load existing data first
        showToast(`Welcome, ${currentUser.name}!`, 'success');
        
    } catch (error) {
        console.error('Sign-in error:', error);
        showToast('Sign-in failed. Please try again.', 'error');
    }
}

// Handle auth state changes
function handleAuthChange(isSignedIn) {
    if (isSignedIn) {
        const user = gapi.auth2.getAuthInstance().currentUser.get();
        const profile = user.getBasicProfile();
        
        currentUser = {
            id: profile.getId(),
            name: profile.getName(),
            email: profile.getEmail(),
            picture: profile.getImageUrl()
        };
        
        updateUserUI();
        loadFromGoogleDrive();
        showToast(`Welcome back, ${currentUser.name}!`, 'success');
    }
}

// Decode JWT response
function decodeJwtResponse(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    return JSON.parse(jsonPayload);
}

// Update user interface
function updateUserUI() {
    const signInButton = document.getElementById('signInButton');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const userPhoto = document.getElementById('userPhoto');
    
    if (currentUser) {
        signInButton.style.display = 'none';
        userInfo.style.display = 'flex';
        userName.textContent = currentUser.name;
        userPhoto.src = currentUser.picture;
    } else {
        signInButton.style.display = 'flex';
        userInfo.style.display = 'none';
    }
}

// Sign out
function signOut() {
    try {
        // Sign out from Google if available
        if (isGapiLoaded && gapi.auth2) {
            const authInstance = gapi.auth2.getAuthInstance();
            if (authInstance) {
                authInstance.signOut();
            }
        }
        
        if (isGsiLoaded && google.accounts) {
            google.accounts.id.disableAutoSelect();
        }
        
        currentUser = null;
        updateUserUI();
        
        // Keep local data but switch to local-only mode
        showToast('Signed out successfully. Data will be saved locally only.', 'info');
        
    } catch (error) {
        console.error('Sign-out error:', error);
        currentUser = null;
        updateUserUI();
        showToast('Signed out successfully', 'info');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Navigation tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchView(e.target.dataset.view));
    });
    
    // Transaction form
    document.getElementById('transactionForm').addEventListener('submit', handleAddTransaction);
    
    // Edit form
    document.getElementById('editTransactionForm').addEventListener('submit', handleEditTransaction);
    
    // Modal controls
    document.getElementById('closeModal').addEventListener('click', closeEditModal);
    document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
    
    // Filters
    document.getElementById('monthFilter').addEventListener('change', applyFilters);
    document.getElementById('yearFilter').addEventListener('change', applyFilters);
    document.getElementById('categoryFilter').addEventListener('change', applyFilters);
    document.getElementById('clearFilters').addEventListener('click', clearFilters);
    
    // Sign out button
    document.getElementById('signOutButton').addEventListener('click', signOut);
    
    // Close modal on outside click
    document.getElementById('editModal').addEventListener('click', (e) => {
        if (e.target.id === 'editModal') {
            closeEditModal();
        }
    });
}

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Set current date
function setCurrentDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('date').value = today;
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    document.getElementById('monthFilter').value = currentMonth;
    
    const currentYear = new Date().getFullYear();
    document.getElementById('yearFilter').value = currentYear;
}

// Transaction management
function handleAddTransaction(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const transaction = {
        id: Date.now().toString(),
        description: formData.get('description') || document.getElementById('description').value,
        amount: parseFloat(document.getElementById('amount').value),
        category: document.getElementById('category').value,
        type: document.getElementById('type').value,
        date: document.getElementById('date').value,
        createdAt: new Date().toISOString()
    };
    
    if (validateTransaction(transaction)) {
        transactions.push(transaction);
        saveTransactions();
        updateUI();
        e.target.reset();
        setCurrentDate();
        showToast('Transaction added successfully!', 'success');
        
        if (currentUser) {
            syncWithGoogleDrive();
        }
    }
}

function validateTransaction(transaction) {
    if (!transaction.description.trim()) {
        showToast('Please enter a description', 'error');
        return false;
    }
    
    if (!transaction.amount || transaction.amount <= 0) {
        showToast('Please enter a valid amount', 'error');
        return false;
    }
    
    if (!transaction.category) {
        showToast('Please select a category', 'error');
        return false;
    }
    
    if (!transaction.date) {
        showToast('Please select a date', 'error');
        return false;
    }
    
    return true;
}

function editTransaction(id) {
    const transaction = transactions.find(t => t.id === id);
    if (!transaction) return;
    
    currentEditingId = id;
    
    // Populate edit form
    document.getElementById('editId').value = id;
    document.getElementById('editDescription').value = transaction.description;
    document.getElementById('editAmount').value = transaction.amount;
    document.getElementById('editCategory').value = transaction.category;
    document.getElementById('editType').value = transaction.type;
    document.getElementById('editDate').value = transaction.date;
    
    // Show modal
    document.getElementById('editModal').style.display = 'flex';
    document.getElementById('editModal').classList.add('fade-in');
}

function handleEditTransaction(e) {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const updatedTransaction = {
        id: id,
        description: document.getElementById('editDescription').value,
        amount: parseFloat(document.getElementById('editAmount').value),
        category: document.getElementById('editCategory').value,
        type: document.getElementById('editType').value,
        date: document.getElementById('editDate').value,
        createdAt: transactions.find(t => t.id === id)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if (validateTransaction(updatedTransaction)) {
        const index = transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            transactions[index] = updatedTransaction;
            saveTransactions();
            updateUI();
            closeEditModal();
            showToast('Transaction updated successfully!', 'success');
            
            if (currentUser) {
                syncWithGoogleDrive();
            }
        }
    }
}

function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateUI();
        showToast('Transaction deleted successfully!', 'success');
        
        if (currentUser) {
            syncWithGoogleDrive();
        }
    }
}

function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
    currentEditingId = null;
}

// View management
function switchView(view) {
    currentView = view;
    
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });
    
    updateUI();
    updateChart();
}

// Data persistence with user separation
function saveTransactions() {
    if (!currentUserId) return;
    
    const key = `transactions_${currentUserId}`;
    localStorage.setItem(key, JSON.stringify(transactions));
    
    // Also save user's last activity
    localStorage.setItem(`lastActivity_${currentUserId}`, new Date().toISOString());
}

function loadTransactions() {
    if (!currentUserId) return;
    
    const key = `transactions_${currentUserId}`;
    const saved = localStorage.getItem(key);
    transactions = saved ? JSON.parse(saved) : [];
}

function clearTransactions() {
    transactions = [];
    updateUI();
}

// UI updates
function updateUI() {
    updateSummary();
    renderTransactions();
    updateChart();
}

function updateSummary() {
    const filteredTransactions = getFilteredTransactions();
    
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const balance = totalIncome - totalExpenses;
    
    document.getElementById('totalIncome').textContent = formatCurrency(totalIncome);
    document.getElementById('totalExpenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('balance').textContent = formatCurrency(balance);
    
    // Update balance color
    const balanceElement = document.getElementById('balance');
    balanceElement.style.color = balance >= 0 ? 'var(--success-color)' : 'var(--error-color)';
}

function renderTransactions() {
    const container = document.getElementById('transactionsList');
    const filteredTransactions = getFilteredTransactions();
    
    if (filteredTransactions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-receipt"></i>
                <h3>No transactions found</h3>
                <p>Add your first transaction or adjust your filters</p>
            </div>
        `;
        return;
    }
    
    // Sort transactions by date (newest first)
    const sortedTransactions = filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    container.innerHTML = sortedTransactions.map(transaction => `
        <div class="transaction-item slide-up">
            <div class="transaction-details">
                <div class="category-icon">
                    ${getCategoryIcon(transaction.category)}
                </div>
                <div class="transaction-info">
                    <h4>${transaction.description}</h4>
                    <p>${formatDate(transaction.date)} • ${getCategoryName(transaction.category)}</p>
                </div>
            </div>
            <div class="transaction-amount ${transaction.type}">
                ${transaction.type === 'income' ? '+' : '-'}${formatCurrency(transaction.amount)}
            </div>
            <div class="transaction-actions">
                <button class="action-btn" onclick="editTransaction('${transaction.id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="deleteTransaction('${transaction.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Filtering
function getFilteredTransactions() {
    let filtered = [...transactions];
    
    // Apply date filters based on current view
    const now = new Date();
    const monthFilter = document.getElementById('monthFilter').value;
    const yearFilter = document.getElementById('yearFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    if (currentView === 'daily') {
        // Show today's transactions by default, or filtered date
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(t => {
            const transactionDate = t.date;
            if (monthFilter) {
                return transactionDate.startsWith(monthFilter);
            }
            return transactionDate === today;
        });
    } else if (currentView === 'monthly') {
        // Show current month by default, or filtered month
        const currentMonth = monthFilter || now.toISOString().slice(0, 7);
        filtered = filtered.filter(t => t.date.startsWith(currentMonth));
    } else if (currentView === 'yearly') {
        // Show current year by default, or filtered year
        const currentYear = yearFilter || now.getFullYear().toString();
        filtered = filtered.filter(t => t.date.startsWith(currentYear));
    }
    
    // Apply category filter
    if (categoryFilter) {
        filtered = filtered.filter(t => t.category === categoryFilter);
    }
    
    return filtered;
}

function applyFilters() {
    updateUI();
}

function clearFilters() {
    document.getElementById('monthFilter').value = '';
    document.getElementById('yearFilter').value = '';
    document.getElementById('categoryFilter').value = '';
    applyFilters();
}

// Chart management
function updateChart() {
    const ctx = document.getElementById('expenseChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (expenseChart) {
        expenseChart.destroy();
    }
    
    const filteredTransactions = getFilteredTransactions();
    const expenses = filteredTransactions.filter(t => t.type === 'expense');
    
    // Group by category
    const categoryData = {};
    expenses.forEach(transaction => {
        const category = transaction.category;
        categoryData[category] = (categoryData[category] || 0) + transaction.amount;
    });
    
    const labels = Object.keys(categoryData).map(cat => getCategoryName(cat));
    const data = Object.values(categoryData);
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
        '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
    ];
    
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverBorderWidth: 3,
                hoverBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatCurrency(context.raw);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Google Drive integration
async function syncWithGoogleDrive() {
    if (!currentUser || !isGapiLoaded) {
        console.log('Google Drive sync not available - using local storage only');
        return;
    }
    
    try {
        // Check if user is still authenticated
        const authInstance = gapi.auth2.getAuthInstance();
        if (!authInstance || !authInstance.isSignedIn.get()) {
            console.log('User not authenticated');
            return;
        }
        
        showSyncStatus('syncing');
        
        const fileName = `expenses_${currentUser.id}.json`;
        const fileContent = JSON.stringify({
            transactions: transactions,
            lastSync: new Date().toISOString(),
            userId: currentUser.id,
            version: '1.0.0'
        });
        
        // Check if file exists
        const existingFile = await findFile(fileName);
        
        if (existingFile) {
            // Update existing file
            await updateFile(existingFile.id, fileContent);
        } else {
            // Create new file
            await createFile(fileName, fileContent);
        }
        
        showSyncStatus('synced');
        showToast('Data synced with Google Drive', 'success');
        
    } catch (error) {
        console.error('Sync error:', error);
        showSyncStatus('error');
        
        // Don't show error toast for demo mode
        if (error.message && !error.message.includes('not loaded')) {
            showToast('Failed to sync with Google Drive. Data saved locally.', 'warning');
        }
    }
}

async function loadFromGoogleDrive() {
    if (!currentUser || !isGapiLoaded) {
        console.log('Google Drive load not available - using local storage only');
        return;
    }
    
    try {
        // Check if user is still authenticated
        const authInstance = gapi.auth2.getAuthInstance();
        if (!authInstance || !authInstance.isSignedIn.get()) {
            console.log('User not authenticated');
            return;
        }
        
        showSyncStatus('syncing');
        
        const fileName = `expenses_${currentUser.id}.json`;
        const file = await findFile(fileName);
        
        if (file) {
            const content = await downloadFile(file.id);
            const data = JSON.parse(content);
            
            if (data.transactions && Array.isArray(data.transactions)) {
                // Merge with local data
                const localTransactions = [...transactions];
                const remoteTransactions = data.transactions;
                
                // Simple merge strategy - keep all unique transactions
                const mergedTransactions = [];
                const seenIds = new Set();
                
                // Add all remote transactions
                remoteTransactions.forEach(t => {
                    if (!seenIds.has(t.id)) {
                        mergedTransactions.push(t);
                        seenIds.add(t.id);
                    }
                });
                
                // Add local transactions that aren't in remote
                localTransactions.forEach(t => {
                    if (!seenIds.has(t.id)) {
                        mergedTransactions.push(t);
                        seenIds.add(t.id);
                    }
                });
                
                transactions = mergedTransactions;
                saveTransactions();
                updateUI();
                
                if (mergedTransactions.length > localTransactions.length) {
                    showToast('Data loaded and merged from Google Drive', 'success');
                }
            }
        } else {
            // No remote file, sync current local data
            if (transactions.length > 0) {
                await syncWithGoogleDrive();
            }
        }
        
        showSyncStatus('synced');
        
    } catch (error) {
        console.error('Load error:', error);
        showSyncStatus('error');
        
        // Don't show error toast for demo mode
        if (error.message && !error.message.includes('not loaded')) {
            showToast('Failed to load from Google Drive. Using local data.', 'warning');
        }
    }
}

async function findFile(fileName) {
    try {
        const response = await gapi.client.drive.files.list({
            q: `name='${fileName}' and parents in 'appDataFolder'`,
            spaces: 'appDataFolder'
        });
        
        return response.result.files.length > 0 ? response.result.files[0] : null;
    } catch (error) {
        console.error('Error finding file:', error);
        return null;
    }
}

async function createFile(fileName, content) {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        const accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
        
        const metadata = {
            name: fileName,
            parents: ['appDataFolder']
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
        form.append('file', new Blob([content], {type: 'application/json'}));
        
        const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({
                'Authorization': `Bearer ${accessToken}`
            }),
            body: form
        });
        
        return response.json();
    } catch (error) {
        console.error('Error creating file:', error);
        throw error;
    }
}

async function updateFile(fileId, content) {
    try {
        const authInstance = gapi.auth2.getAuthInstance();
        const accessToken = authInstance.currentUser.get().getAuthResponse().access_token;
        
        const response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: new Headers({
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }),
            body: content
        });
        
        return response.json();
    } catch (error) {
        console.error('Error updating file:', error);
        throw error;
    }
}

async function downloadFile(fileId) {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });
        
        return response.body;
    } catch (error) {
        console.error('Error downloading file:', error);
        throw error;
    }
}

function showSyncStatus(status) {
    const syncIndicator = document.getElementById('syncStatus');
    const icon = syncIndicator.querySelector('i');
    
    syncIndicator.className = `sync-indicator ${status}`;
    
    switch (status) {
        case 'syncing':
            icon.className = 'fas fa-sync-alt fa-spin';
            syncIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Syncing...';
            break;
        case 'synced':
            icon.className = 'fas fa-check';
            syncIndicator.innerHTML = '<i class="fas fa-check"></i> Synced';
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-triangle';
            syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sync Error';
            break;
    }
}

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function getCategoryIcon(category) {
    const icons = {
        food: '🍕',
        transport: '🚗',
        shopping: '🛒',
        entertainment: '🎬',
        bills: '💡',
        health: '🏥',
        income: '💰',
        other: '📋'
    };
    return icons[category] || '📋';
}

function getCategoryName(category) {
    const names = {
        food: 'Food',
        transport: 'Transport',
        shopping: 'Shopping',
        entertainment: 'Entertainment',
        bills: 'Bills',
        health: 'Health',
        income: 'Income',
        other: 'Other'
    };
    return names[category] || 'Other';
}

// Export/Import functionality for everyone
function exportToJSON() {
    const userName = localStorage.getItem('userName') || 'User';
    const data = {
        userName: userName,
        userId: currentUserId,
        transactions: transactions,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `${userName}-expenses-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showToast(`${userName}'s expenses downloaded successfully!`, 'success');
}

function addImportButton() {
    const signInButton = document.getElementById('signInButton');
    if (signInButton && signInButton.parentNode) {
        // Check if import button already exists to avoid duplicates
        const existingImport = document.getElementById('importButton');
        if (existingImport) {
            return; // Don't add duplicate
        }
        
        const importButton = document.createElement('button');
        importButton.id = 'importButton';
        importButton.innerHTML = '<i class="fas fa-upload"></i> Import Data';
        importButton.className = 'sign-in-btn';
        importButton.style.background = 'var(--warning-color)';
        importButton.style.marginLeft = '0.5rem';
        
        // Create hidden file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', handleFileImport);
        
        importButton.addEventListener('click', () => fileInput.click());
        
        signInButton.parentNode.appendChild(importButton);
        signInButton.parentNode.appendChild(fileInput);
    }
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.transactions && Array.isArray(data.transactions)) {
                // Merge with existing data
                const existingIds = new Set(transactions.map(t => t.id));
                const newTransactions = data.transactions.filter(t => !existingIds.has(t.id));
                
                transactions.push(...newTransactions);
                saveTransactions();
                updateUI();
                
                showToast(`Imported ${newTransactions.length} new transactions!`, 'success');
            } else {
                throw new Error('Invalid file format');
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Failed to import data. Please check file format.', 'error');
        }
    };
    
    reader.readAsText(file);
}

// Load Google APIs when available
window.onload = function() {
    console.log('Window loaded, checking for Google APIs...');
    
    let retryCount = 0;
    const maxRetries = 10;
    
    // Wait for scripts to fully initialize
    const checkAPIs = () => {
        retryCount++;
        console.log(`Checking API availability... (attempt ${retryCount}/${maxRetries})`);
        console.log('gapi available:', typeof gapi !== 'undefined');
        console.log('google available:', typeof google !== 'undefined');
        console.log('window.gapiLoaded:', window.gapiLoaded);
        console.log('window.gsiLoaded:', window.gsiLoaded);
        
        let gapiReady = false;
        let gsiReady = false;
        
        if (window.gapiLoaded && typeof gapi !== 'undefined') {
            console.log('Google API detected and ready, initializing...');
            initializeGapi();
            gapiReady = true;
        }
        
        if (window.gsiLoaded && typeof google !== 'undefined') {
            console.log('Google Identity Services detected and ready, initializing...');
            initializeGsi();
            gsiReady = true;
        }
        
        // If neither is ready and we haven't exceeded max retries, try again
        if (!gapiReady && !gsiReady && retryCount < maxRetries) {
            console.log('APIs not ready yet, trying again in 1 second...');
            setTimeout(checkAPIs, 1000);
        } else if (!gapiReady && !gsiReady) {
            console.log('Google APIs failed to initialize after maximum retries. Switching to demo mode.');
            console.log('This could be due to:');
            console.log('1. Network/firewall blocking Google APIs');
            console.log('2. Corporate security policies');
            console.log('3. Antivirus blocking scripts');
            console.log('4. Browser security settings');
            showDemoModeMessage();
        } else {
            console.log('At least one Google API initialized successfully!');
        }
    };
    
    // Start checking after scripts have had time to load
    setTimeout(checkAPIs, 1000);
};

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}