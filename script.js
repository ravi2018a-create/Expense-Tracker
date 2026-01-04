// Supabase Configuration
const SUPABASE_URL = 'https://hqfzyvfwuvhififooakv.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jCWTGr4jb5IhBL5-WDGwaA_HmdMTcYO';
let supabaseClient = null;

// App State
let currentUser = null;
let transactions = [];
let currentView = 'daily';
let expenseChart = null;
let currentEditingId = null;
let currentUserId = null; // Add user ID tracking

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Supabase for backend features
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase ready for backend features');
        
        // Check if user is already signed in
        await checkSupabaseAuth();
    } else {
        console.log('Supabase not available - using localStorage only');
        updateConnectionStatus('local');
    }
    
    initializeApp();
    setupEventListeners();
    
    // Load transactions (from database if authenticated, localStorage if not)
    await loadTransactions();
    updateUI();
    setCurrentDate();
    
    // Show welcome message
    setTimeout(() => {
        if (currentUser) {
            showToast(`Welcome back! Data synced to database.`, 'success');
        } else {
            showToast(`Welcome! Sign in to save data to database.`, 'info');
        }
    }, 2000);
});

// Check Supabase authentication
async function checkSupabaseAuth() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            currentUser = session.user;
            updateConnectionStatus('database');
            console.log('User authenticated with Supabase:', currentUser.email);
        } else {
            updateConnectionStatus('local');
            console.log('No authenticated user - using localStorage');
        }
    } catch (error) {
        console.error('Auth check error:', error);
        updateConnectionStatus('local');
    }
}

// Update connection status display
function updateConnectionStatus(mode) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
        if (mode === 'database') {
            connectionStatus.innerHTML = '<small><i class="fas fa-database"></i> Database Connected</small>';
            connectionStatus.style.color = 'var(--success-color)';
        } else {
            connectionStatus.innerHTML = '<small><i class="fas fa-hdd"></i> Local Storage</small>';
            connectionStatus.style.color = 'var(--text-secondary)';
        }
    }
}

// Handle authentication (sign in/up)
async function handleAuth() {
    const email = prompt('Enter your email:');
    if (!email) return;
    
    const password = prompt('Enter your password (min 6 characters):');
    if (!password || password.length < 6) {
        showToast('Password must be at least 6 characters', 'error');
        return;
    }
    
    try {
        // Try to sign in first
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });
        
        if (error) {
            if (error.message.includes('Invalid login credentials')) {
                // If sign in fails, offer to sign up
                const createAccount = confirm('Account not found. Create new account?');
                if (createAccount) {
                    const fullName = prompt('Enter your full name:') || 'User';
                    await handleSignUp(email, password, fullName);
                }
            } else {
                throw error;
            }
        } else {
            // Sign in successful
            currentUser = data.user;
            updateUIForAuth();
            await loadTransactions();
            updateUI();
            showToast('Signed in successfully!', 'success');
        }
    } catch (error) {
        console.error('Sign in error:', error);
        showToast('Sign in failed: ' + error.message, 'error');
    }
}

// Handle sign up
async function handleSignUp(email, password, fullName) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });
        
        if (error) throw error;
        
        if (data.user && !data.session) {
            showToast('Account created! Please check your email to verify.', 'success');
        } else {
            currentUser = data.user;
            updateUIForAuth();
            await loadTransactions();
            updateUI();
            showToast('Account created and signed in!', 'success');
        }
    } catch (error) {
        console.error('Sign up error:', error);
        showToast('Sign up failed: ' + error.message, 'error');
    }
}

// Handle sign out
async function handleSignOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        
        currentUser = null;
        updateUIForAuth();
        await loadTransactions(); // Load localStorage data
        updateUI();
        showToast('Signed out successfully!', 'success');
    } catch (error) {
        console.error('Sign out error:', error);
        showToast('Sign out failed: ' + error.message, 'error');
    }
}

// Update UI based on authentication state
function updateUIForAuth() {
    const authButton = document.getElementById('authButton');
    const userInfo = document.getElementById('userInfo');
    const userEmail = document.getElementById('userEmail');
    
    if (currentUser) {
        // User is signed in
        if (authButton) authButton.style.display = 'none';
        if (userInfo) userInfo.style.display = 'flex';
        if (userEmail) userEmail.textContent = currentUser.email;
        updateConnectionStatus('database');
    } else {
        // User is signed out
        if (authButton) authButton.style.display = 'block';
        if (userInfo) userInfo.style.display = 'none';
        updateConnectionStatus('local');
    }
}

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
    // Google API integration removed - now using Supabase exclusively
}
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
        console.log('GSI initialization removed - using Supabase authentication');
}

// Simplified initialization - Google APIs removed
function initializeApp() {
    console.log('Initializing expense tracker app...');
    // All Google API initialization removed
    // App now uses Supabase exclusively
}

// Google API functions removed - using Supabase exclusively
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
    
    // Download button now in recent transactions section
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
    const transactionsHeader = document.querySelector('.transactions-header');
    if (transactionsHeader) {
        // Check if download button already exists to avoid duplicates
        const existingDownload = document.getElementById('downloadButton');
        if (existingDownload) {
            return; // Don't add duplicate
        }
        
        const downloadButton = document.createElement('button');
        downloadButton.id = 'downloadButton';
        downloadButton.innerHTML = '<i class="fas fa-download"></i> Export';
        downloadButton.className = 'action-button export-btn';
        downloadButton.style.cssText = `
            background: var(--success-color);
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: all 0.3s ease;
        `;
        downloadButton.addEventListener('click', exportToJSON);
        
        // Add hover effect
        downloadButton.addEventListener('mouseenter', () => {
            downloadButton.style.transform = 'translateY(-2px)';
            downloadButton.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        });
        downloadButton.addEventListener('mouseleave', () => {
            downloadButton.style.transform = 'translateY(0)';
            downloadButton.style.boxShadow = 'none';
        });
        
        transactionsHeader.appendChild(downloadButton);
    }
}

// Handle Google Sign-in (removed - now using Supabase)
// Legacy function kept for compatibility - now redirects to Supabase auth
function handleSignInWithGoogle() {
    showToast('Please use "Sign In for Database" button for authentication', 'info');
}

// Handle auth state changes (simplified for Supabase)
function handleAuthChange(isSignedIn) {
    // This function is kept for compatibility but does nothing
    // Auth changes are now handled by Supabase auth listeners
}
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

// Sign out (now uses Supabase authentication only)
function signOut() {
    try {
        // Supabase sign out is handled by handleSignOut function
        // This function kept for compatibility
        handleSignOut();
    } catch (error) {
        console.error('Sign-out error:', error);
        currentUser = null;
        updateUI();
        showToast('Signed out successfully', 'info');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Authentication buttons
    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.addEventListener('click', handleAuth);
    }
    
    const signOutButton = document.getElementById('signOutButton');
    if (signOutButton) {
        signOutButton.addEventListener('click', handleSignOut);
    }
    
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
async function handleAddTransaction(e) {
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
        if (currentUser && supabaseClient) {
            // Save to database
            try {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .insert([{
                        user_id: currentUser.id,
                        description: transaction.description,
                        amount: transaction.amount,
                        category: transaction.category,
                        type: transaction.type,
                        date: transaction.date
                    }])
                    .select()
                    .single();
                
                if (error) throw error;
                
                // Add to local array with database ID
                transactions.unshift(data);
                showToast('Transaction saved to database!', 'success');
                
            } catch (error) {
                console.error('Database save error:', error);
                showToast('Failed to save to database, saved locally', 'warning');
                // Fall back to localStorage
                transactions.push(transaction);
                saveTransactions();
            }
        } else {
            // Save to localStorage
            transactions.push(transaction);
            saveTransactions();
            showToast('Transaction added successfully!', 'success');
        }
        
        updateUI();
        e.target.reset();
        setCurrentDate();
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

async function loadTransactions() {
    if (currentUser && supabaseClient) {
        // Load from Supabase database
        try {
            const { data, error } = await supabaseClient
                .from('transactions')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            transactions = data || [];
            console.log(`Loaded ${transactions.length} transactions from database`);
        } catch (error) {
            console.error('Error loading from database:', error);
            showToast('Failed to load from database, using local storage', 'warning');
            loadFromLocalStorage();
        }
    } else {
        // Load from localStorage
        loadFromLocalStorage();
    }
}

function loadFromLocalStorage() {
    if (!currentUserId) {
        // Create a temporary user for localStorage
        currentUserId = localStorage.getItem('tempUserId') || 'temp_' + Date.now();
        localStorage.setItem('tempUserId', currentUserId);
    }
    
    const key = `transactions_${currentUserId}`;
    const saved = localStorage.getItem(key);
    transactions = saved ? JSON.parse(saved) : [];
    console.log(`Loaded ${transactions.length} transactions from localStorage`);
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
    updateCurrentPeriodDisplay();
}

function updateCurrentPeriodDisplay() {
    const displayElement = document.getElementById('currentPeriodDisplay');
    if (!displayElement) return;
    
    const now = new Date();
    const monthFilter = document.getElementById('monthFilter').value;
    const yearFilter = document.getElementById('yearFilter').value;
    
    if (currentView === 'daily') {
        if (monthFilter) {
            const filterDate = new Date(monthFilter + '-01');
            displayElement.textContent = `Daily Expenses - ${filterDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        } else {
            displayElement.textContent = `Today's Expenses - ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`;
        }
    } else if (currentView === 'monthly') {
        if (monthFilter) {
            const filterDate = new Date(monthFilter + '-01');
            displayElement.textContent = `Monthly Expenses - ${filterDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`;
        } else {
            displayElement.textContent = `Monthly Expenses - ${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}`;
        }
    } else if (currentView === 'yearly') {
        const year = yearFilter || now.getFullYear().toString();
        displayElement.textContent = `Yearly Expenses - ${year}`;
    }
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
    
    // Add download button to recent transactions header
    addDownloadButton();
    
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

// Google Drive functions removed - now using Supabase database exclusively

function showSyncStatus(status) {
    const syncIndicator = document.getElementById('syncStatus');
    if (!syncIndicator) return;
    
    const icon = syncIndicator.querySelector('i');
    
    syncIndicator.className = `sync-indicator ${status}`;
    
    switch (status) {
        case 'syncing':
            if (icon) icon.className = 'fas fa-sync-alt fa-spin';
            syncIndicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Syncing...';
            break;
        case 'synced':
            if (icon) icon.className = 'fas fa-check';
            syncIndicator.innerHTML = '<i class="fas fa-check"></i> Synced';
            break;
        case 'error':
            if (icon) icon.className = 'fas fa-exclamation-triangle';
            syncIndicator.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Sync Error';
            break;
    }
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

// Simplified initialization - no Google API checking needed
// All authentication now handled by Supabase

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