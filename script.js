/*
 * SUPABASE CONFIGURATION GUIDE
 * 
 * To fix email redirect issues, configure these settings in your Supabase Dashboard:
 * 
 * 1. Go to: https://supabase.com/dashboard/project/hqfzyvfwuvhififooakv/auth/settings
 * 
 * 2. Set "Site URL" to your deployed app URL:
 *    - Production: https://expense-tracker-nh2v.vercel.app
 *    - For localhost testing: http://localhost:3000 (or your port)
 * 
 * 3. Add "Redirect URLs" (one per line):
 *    https://expense-tracker-nh2v.vercel.app
 *    https://expense-tracker-nh2v.vercel.app/**
 *    https://expense-tracker-nh2v.vercel.app/auth/callback
 *    http://localhost:3000 (for testing)
 * 
 * 4. Email Templates → Confirm signup:
 *    Make sure {{ .SiteURL }} is used in email templates
 * 
 * 5. Save all settings and test again
 */

// Supabase Configuration
const SUPABASE_URL = 'https://hqfzyvfwuvhififooakv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZnp5dmZ3dXZoaWZpZm9vYWt2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MTE1NDgsImV4cCI6MjA4MzA4NzU0OH0.dL6sipambsU8Cl-uaZUd6o7pMraj06AtowRq4euNyiM';
let supabaseClient = null;

// Get the current site URL for redirects
const SITE_URL = window.location.origin;

// Handle email verification callback
async function handleAuthCallback() {
    // Handle both URL hash and query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    
    const accessToken = urlParams.get('access_token') || hashParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token') || hashParams.get('refresh_token');
    const type = urlParams.get('type') || hashParams.get('type');
    
    if (type === 'signup' || (accessToken && refreshToken)) {
        console.log('Email verification callback detected');
        showToast('Email verified successfully! You are now signed in.', 'success');
        
        // Clean up URL parameters
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Wait a moment for auth to settle
        setTimeout(async () => {
            await checkSupabaseAuth();
            updateUI();
        }, 1000);
    }
}

// App State
let currentUser = null;
// Updated data structure for categories
let categories = {
    'daily': { name: 'Daily Expenses', icon: 'fas fa-calendar-day', transactions: [] }
};
let activeCategory = 'daily'; // Current active category
let transactions = []; // Legacy support - will be phased out
let currentView = 'all'; // Start with showing all transactions
let currentEditingId = null;
let currentUserId = null; // Add user ID tracking
let comparisonChart = null; // Chart instance
let customStartDate = null; // Custom range start
let customEndDate = null; // Custom range end

// Chart filtering state
let chartDataVisibility = {
    income: true,
    expense: true
};

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    // Initialize theme immediately from localStorage for instant loading
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    // Update theme icon if available (may not be loaded yet)
    setTimeout(() => updateThemeIcon(savedTheme), 100);
    console.log(`🎨 Theme initialized from localStorage: ${savedTheme}`);
    
    // Check for persistent authentication in localStorage FIRST
    const savedAuth = localStorage.getItem('expense-tracker-user-session');
    if (savedAuth) {
        try {
            const authData = JSON.parse(savedAuth);
            if (authData.user && authData.email && authData.signedInAt) {
                // Check if session is not too old (optional: expire after 30 days)
                const signedInDate = new Date(authData.signedInAt);
                const daysSinceSignIn = (new Date() - signedInDate) / (1000 * 60 * 60 * 24);
                
                if (daysSinceSignIn < 30) {
                    console.log('🔐 Found valid saved session for:', authData.email);
                    currentUser = authData.user;
                    // IMPORTANT: Set currentUserId for proper data isolation
                    currentUserId = authData.user.id;
                    console.log('👤 Set currentUserId from localStorage:', currentUserId);
                    
                    updateUIForAuth();
                    updateConnectionStatus('database');
                    hideLoadingOverlay();
                    showToast(`Welcome back, ${authData.user.user_metadata?.full_name || authData.user.user_metadata?.name || authData.email?.split('@')[0] || 'User'}!`, 'success');
                    
                    // Don't load transactions yet - wait for Supabase to initialize
                    console.log('⏳ Waiting for Supabase session to sync...');
                    
                    console.log('✅ User automatically signed in from localStorage');
                } else {
                    console.log('⏰ Saved session expired, clearing');
                    localStorage.removeItem('expense-tracker-user-session');
                }
            } else {
                console.log('⚠️ Incomplete saved session data, clearing');
                localStorage.removeItem('expense-tracker-user-session');
            }
        } catch (error) {
            console.log('⚠️ Invalid saved session, clearing:', error);
            localStorage.removeItem('expense-tracker-user-session');
        }
    }
    
    // Handle auth callback from email verification
    handleAuthCallback();
    
    // Initialize Supabase for backend features
    console.log('🔍 Checking Supabase availability:', typeof window.supabase);
    console.log('🔍 Supabase URL:', SUPABASE_URL);
    console.log('🔍 API Key length:', SUPABASE_ANON_KEY.length);
    
    if (typeof window.supabase !== 'undefined') {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                redirectTo: SITE_URL,
                autoRefreshToken: true,
                persistSession: true,
                detectSessionInUrl: true,
                storage: window.localStorage,
                storageKey: 'expense-tracker-auth',
                flowType: 'pkce'
            }
        });
        console.log('Supabase ready for backend features');
        console.log('Site URL configured as:', SITE_URL);
        
        // Test database connection and table existence (without blocking)
        setTimeout(async () => {
            if (supabaseClient && currentUser) {
                try {
                    console.log('🔍 Testing database connection...');
                    
                    // Simple test - just try to access the table
                    const { data, error } = await supabaseClient
                        .from('transactions')
                        .select('id')
                        .limit(1);
                    
                    if (error) {
                        console.error('❌ Database test failed:', error);
                        console.log('📝 Error details:', error.message, error.code);
                    } else {
                        console.log('✅ Database connected successfully');
                    }
                } catch (error) {
                    console.error('❌ Database test exception:', error);
                }
            }
        }, 3000);
        
        // Only show loading overlay if user is not already authenticated from localStorage
        if (!currentUser) {
            showLoadingOverlay('Checking your session...');
        }
        
        // Set failsafe timeout to hide loading overlay after 4 seconds max
        const loadingTimeout = setTimeout(() => {
            console.log('⏰ Loading overlay timeout reached, forcing hide');
            hideLoadingOverlay();
            // If no user after timeout, show auth modal
            if (!currentUser) {
                setTimeout(() => {
                    console.log('🔐 Opening auth modal after timeout');
                    showToast('Please sign in to access your expense data securely', 'info');
                    openAuthModal();
                }, 500);
            }
        }, 4000);
        
        // Set up auth state listener for automatic session management
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            console.log('🔄 Auth state change:', event, session?.user?.email || 'No user');
            
            // Clear timeout and hide loading overlay on any auth state change
            clearTimeout(loadingTimeout);
            hideLoadingOverlay();
            
            if (event === 'SIGNED_IN' && session) {
                // Check if user is already authenticated from localStorage to avoid duplicate actions
                const wasAlreadyAuthenticated = currentUser && currentUser.email === session.user.email;
                
                currentUser = session.user;
                // IMPORTANT: Set currentUserId to the authenticated user's ID for proper data isolation
                currentUserId = session.user.id;
                console.log('👤 Set currentUserId to authenticated user:', currentUserId);
                
                // Save user session to localStorage for persistent login
                const userSession = {
                    user: session.user,
                    email: session.user.email,
                    signedInAt: new Date().toISOString()
                };
                localStorage.setItem('expense-tracker-user-session', JSON.stringify(userSession));
                console.log('📋 User session saved to localStorage');
                
                updateUIForAuth();
                closeAuthModal(); // Close auth modal if it's open
                
                // ALWAYS load transactions when Supabase session is ready
                console.log('🔄 Supabase session ready - loading transactions from database...');
                await loadTransactions();
                updateUI();
                
                if (!wasAlreadyAuthenticated) {
                    showToast(`Welcome back, ${session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User'}!`, 'success');
                } else {
                    console.log('✅ Supabase session synced with localStorage session');
                }
                
                updateConnectionStatus('database');
            } else if (event === 'SIGNED_OUT') {
                console.log('🚶 User signed out, cleaning up...');
                
                // Clear all user data
                currentUser = null;
                transactions = [];
                
                // Clear local storage auth data including persistent session
                localStorage.removeItem('expense-tracker-auth');
                localStorage.removeItem('currentUser');
                localStorage.removeItem('expense-tracker-user-session');
                console.log('🧹 Cleared all auth data from localStorage');
                
                // Keep current theme preference (don't reset to light)
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                localStorage.setItem('theme', currentTheme);
                console.log(`🎨 Preserving theme preference: ${currentTheme}`);
                
                // Update UI
                updateUIForAuth();
                updateUI();
                updateConnectionStatus('local');
                
                showToast('Successfully signed out', 'success');
                
                // Show auth modal after a brief delay
                setTimeout(() => {
                    showToast('Please sign in to access your expense data', 'info');
                    openAuthModal();
                }, 1500);
            } else if (event === 'TOKEN_REFRESHED' && session) {
                currentUser = session.user;
                console.log('🔄 Token refreshed for user:', session.user.email);
            }
        });
        
        // Only proceed with Supabase auth checks if user wasn't authenticated from localStorage
        if (!currentUser) {
            // Check if user is already signed in
            try {
                await checkSupabaseAuth();
            } catch (error) {
                console.log('⚠️ Auth check failed:', error.message);
                hideLoadingOverlay();
                clearTimeout(loadingTimeout);
            }
            
            // Clear timeout after auth check
            clearTimeout(loadingTimeout);
            
            // Show auth modal if no user is authenticated
            setTimeout(() => {
                if (!currentUser) {
                    console.log('👤 No user found, showing auth modal');
                    showToast('Please sign in to access your expense data securely', 'info');
                    openAuthModal();
                }
            }, 800);
        } else {
            console.log('🚀 User already authenticated from localStorage, skipping Supabase auth check');
            clearTimeout(loadingTimeout);
        }
    } else {
        console.log('⚠️ Supabase not available - using localStorage only');
        updateConnectionStatus('local');
        // Hide loading immediately if no Supabase
        hideLoadingOverlay();
    }
    
    initializeApp();
    setupEventListeners();
    initializeChartLegendToggles();
    setupAuthModalListeners(); // Add authentication form listeners
    
    // Load transactions (from database if authenticated, localStorage if not)
    await loadTransactions();
    updateUI();
    updateTransactionCount(); // Ensure transaction count is displayed
    setCurrentDate();
    
    // Hide loading overlay after initialization (backup)
    hideLoadingOverlay();
    
    // Show welcome message
    setTimeout(() => {
        if (currentUser) {
            showToast(`Welcome back! Data synced to database.`, 'success');
        } else {
            showToast(`Welcome! Sign in to save data to database.`, 'info');
        }
    }, 2000);
});

// Check Supabase authentication with enhanced session restoration
async function checkSupabaseAuth() {
    try {
        console.log('🔍 Checking for existing authentication session...');
        
        // Use a timeout to prevent hanging
        const authPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Session check timeout')), 3000)
        );
        
        const { data: { session }, error } = await Promise.race([authPromise, timeoutPromise]);
        
        if (error) {
            console.error('❌ Session check error:', error);
            updateConnectionStatus('local');
            hideLoadingOverlay();
            return;
        }
        
        if (session && session.user) {
            currentUser = session.user;
            updateUIForAuth();
            updateConnectionStatus('database');
            console.log('✅ User automatically signed in:', currentUser.email);
            
            // Load user data in background (don't wait)
            Promise.all([
                loadTransactions(),
                loadThemeFromBackend()
            ]).then(() => {
                updateUI();
            }).catch(error => {
                console.error('Error loading user data:', error);
                updateUI(); // Still update UI even if data loading fails
            });
            
            showToast(`Welcome back, ${currentUser.user_metadata?.full_name || currentUser.user_metadata?.name || currentUser.email?.split('@')[0] || 'User'}!`, 'success');
        } else {
            console.log('ℹ️ No existing session found');
            updateConnectionStatus('local');
        }
        
        // Always hide loading overlay after check - immediate
        hideLoadingOverlay();
        
    } catch (error) {
        console.error('❌ Auth check error:', error);
        updateConnectionStatus('local');
        hideLoadingOverlay();
    }
}

// Show loading overlay
function showLoadingOverlay(message = 'Checking your session...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = loadingOverlay?.querySelector('p');
    if (loadingOverlay) {
        if (loadingText) loadingText.textContent = message;
        loadingOverlay.style.display = 'flex';
    }
}

// Hide loading overlay
function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay && loadingOverlay.style.display !== 'none') {
        console.log('🫥 Hiding loading overlay');
        loadingOverlay.style.display = 'none';
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

// Open authentication modal instead of using prompts
function handleAuth() {
    openAuthModal();
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
                },
                emailRedirectTo: SITE_URL
            }
        });
        
        if (error) throw error;
        
        // Since email confirmation is disabled, user should be signed in directly
        if (data.user) {
            currentUser = data.user;
            currentUserId = data.user.id;
            updateUIForAuth();
            closeAuthModal();
            await loadTransactions();
            updateUI();
            showToast('🎉 Account created successfully! Welcome!', 'success');
        }
    } catch (error) {
        console.error('Sign up error:', error);
        showToast('Sign up failed: ' + error.message, 'error');
    }
}

// Show email verification popup
function showEmailVerificationPopup(email) {
    // Create popup overlay
    const overlay = document.createElement('div');
    overlay.id = 'email-verification-popup';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    overlay.innerHTML = `
        <div style="
            background: var(--card-bg, #1e1e2e);
            border-radius: 16px;
            padding: 40px;
            max-width: 450px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            border: 1px solid var(--border-color, #333);
        ">
            <div style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #4f46e5, #7c3aed);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
            ">
                <i class="fas fa-envelope" style="font-size: 36px; color: white;"></i>
            </div>
            <h2 style="color: var(--text-color, #fff); margin-bottom: 16px; font-size: 24px;">
                📧 Check Your Email!
            </h2>
            <p style="color: var(--text-secondary, #aaa); margin-bottom: 12px; font-size: 16px; line-height: 1.6;">
                We've sent a verification link to:
            </p>
            <p style="color: #4f46e5; font-weight: 600; font-size: 18px; margin-bottom: 20px;">
                ${email}
            </p>
            <p style="color: var(--text-secondary, #aaa); margin-bottom: 24px; font-size: 14px; line-height: 1.6;">
                Please click the link in your email to verify your account. 
                After verification, you can sign in with your credentials.
            </p>
            <button onclick="document.getElementById('email-verification-popup').remove()" style="
                background: linear-gradient(135deg, #4f46e5, #7c3aed);
                color: white;
                border: none;
                padding: 14px 40px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                Got it!
            </button>
            <p style="color: var(--text-secondary, #888); margin-top: 20px; font-size: 12px;">
                Didn't receive the email? Check your spam folder.
            </p>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Close auth modal if open
    closeAuthModal();
}

// Show user not found popup - prompts user to sign up
function showUserNotFoundPopup() {
    // Create popup overlay
    const overlay = document.createElement('div');
    overlay.id = 'user-not-found-popup';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    overlay.innerHTML = `
        <div style="
            background: var(--card-bg, #1e1e2e);
            border-radius: 16px;
            padding: 40px;
            max-width: 450px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
            border: 1px solid var(--border-color, #333);
        ">
            <div style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #ef4444, #f97316);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px;
            ">
                <i class="fas fa-user-times" style="font-size: 36px; color: white;"></i>
            </div>
            <h2 style="color: var(--text-color, #fff); margin-bottom: 16px; font-size: 24px;">
                🔍 User Not Found!
            </h2>
            <p style="color: var(--text-secondary, #aaa); margin-bottom: 24px; font-size: 16px; line-height: 1.6;">
                We couldn't find an account with these credentials. 
                Please check your email and password, or create a new account.
            </p>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button onclick="document.getElementById('user-not-found-popup').remove()" style="
                    background: transparent;
                    color: var(--text-secondary, #aaa);
                    border: 1px solid var(--border-color, #444);
                    padding: 14px 28px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.borderColor='#666'" onmouseout="this.style.borderColor='#444'">
                    Try Again
                </button>
                <button onclick="document.getElementById('user-not-found-popup').remove(); switchAuthTab('signup');" style="
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: white;
                    border: none;
                    padding: 14px 28px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s, box-shadow 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    Sign Up Now
                </button>
            </div>
            <p style="color: var(--text-secondary, #888); margin-top: 20px; font-size: 12px;">
                Create an account to start tracking your expenses!
            </p>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

// Handle sign out with complete session cleanup
async function handleSignOut() {
    try {
        console.log('📋 Signing out user...');
        
        // Prevent multiple simultaneous signout attempts
        if (window._signingOut) {
            console.log('🔄 Signout already in progress...');
            return;
        }
        window._signingOut = true;
        
        // Immediately clear local session data first
        console.log('🧹 Clearing local session data...');
        
        // Clear all user data
        currentUser = null;
        currentUserId = null; // Clear user ID to prevent cross-account data
        transactions = [];
        
        // Clear local storage auth data including persistent session
        localStorage.removeItem('expense-tracker-auth');
        localStorage.removeItem('currentUser');
        localStorage.removeItem('expense-tracker-user-session');
        localStorage.removeItem('userId'); // Clear the generic userId
        localStorage.removeItem('tempUserId'); // Clear temp user
        console.log('✅ Cleared all auth data from localStorage');
        
        // Keep current theme preference (don't reset to light)
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        localStorage.setItem('theme', currentTheme);
        
        // Update UI immediately
        updateUIForAuth();
        updateUI();
        updateConnectionStatus('local');
        
        console.log('✅ Local signout complete');
        
        // Try Supabase signout in the background (don't wait for it)
        if (supabaseClient) {
            supabaseClient.auth.signOut().then(() => {
                console.log('✅ Supabase signout successful');
            }).catch(error => {
                console.log('⚠️ Supabase signout failed (but local signout succeeded):', error);
            });
        }
        
        showToast('Successfully signed out', 'success');
        
        // Show auth modal after a brief delay
        setTimeout(() => {
            showToast('Please sign in to access your expense data', 'info');
            openAuthModal();
        }, 1500);
        
    } catch (error) {
        console.error('❌ Sign out error:', error);
        showToast('Sign out failed', 'error');
    } finally {
        // Reset the signout flag
        window._signingOut = false;
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
        if (userEmail) {
            // Display user's name if available, otherwise use email prefix
            const userName = currentUser.user_metadata?.full_name || 
                           currentUser.user_metadata?.name || 
                           currentUser.email?.split('@')[0] || 
                           'User';
            userEmail.textContent = userName;
        }
        updateConnectionStatus('database');
        
        // Load user's theme preference from backend
        if (supabaseClient) {
            loadThemeFromBackend();
        }
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

// Simplified initialization - Google APIs removed
function initializeApp() {
    console.log('Initializing expense tracker app...');
    // All Google API initialization removed
    // App now uses Supabase exclusively
}

// Legacy function for compatibility
function setupDemoMode() {
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

// Setup custom date range listeners
function setupCustomRangeListeners() {
    // Apply custom range button
    const applyRangeBtn = document.getElementById('applyRangeBtn');
    if (applyRangeBtn) {
        applyRangeBtn.addEventListener('click', () => {
            applyCustomRange();
        });
    }
    
    // Quick range buttons
    const quickRangeBtns = document.querySelectorAll('.quick-range-btn');
    quickRangeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const days = parseInt(btn.dataset.range);
            applyQuickRange(days);
            
            // Update active state
            quickRangeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Set default dates for custom range
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    if (startDateInput && endDateInput) {
        const today = new Date();
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        endDateInput.value = formatDateForInput(today);
        startDateInput.value = formatDateForInput(thirtyDaysAgo);
    }
}

// Apply custom date range
function applyCustomRange() {
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    
    if (!startDate || !endDate) {
        showToast('Please select both start and end dates', 'error');
        return;
    }
    
    if (startDate > endDate) {
        showToast('Start date must be before end date', 'error');
        return;
    }
    
    customStartDate = startDate;
    customEndDate = endDate;
    
    console.log('📅 Custom range applied:', customStartDate, 'to', customEndDate);
    
    // Update the period header display
    updatePeriodDisplay();
    updateUI();
    showToast('Custom range applied', 'success');
}

// Apply quick range preset
function applyQuickRange(days) {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (startDateInput && endDateInput) {
        startDateInput.value = formatDateForInput(startDate);
        endDateInput.value = formatDateForInput(today);
    }
    
    customStartDate = formatDateForInput(startDate);
    customEndDate = formatDateForInput(today);
    
    console.log('📅 Quick range applied:', customStartDate, 'to', customEndDate);
    
    updatePeriodDisplay();
    updateUI();
}

// Apply quick period range from header buttons
function applyQuickPeriodRange(days) {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - days);
    
    // Set to custom view for filtering but don't show UI
    currentView = 'custom';
    customStartDate = formatDateForInput(startDate);
    customEndDate = formatDateForInput(today);
    
    // Update the custom range inputs silently
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    if (startDateInput && endDateInput) {
        startDateInput.value = customStartDate;
        endDateInput.value = customEndDate;
    }
    
    console.log('📅 Quick period range applied:', customStartDate, 'to', customEndDate);
    
    updatePeriodDisplay();
    // Don't call updateUI here as it's called by the button handler
}

// Setup event listeners
function setupEventListeners() {
    console.log('🔧 Setting up event listeners...');
    
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            console.log('🎨 Theme toggle clicked');
            toggleTheme();
        });
        console.log('✅ Theme toggle listener added');
    } else {
        console.warn('❌ Theme toggle button not found');
    }
    
    // Authentication buttons
    const authButton = document.getElementById('authButton');
    if (authButton) {
        authButton.addEventListener('click', () => {
            console.log('🔐 Auth button clicked');
            handleAuth();
        });
        console.log('✅ Auth button listener added');
    } else {
        console.warn('❌ Auth button not found');
    }
    
    const signOutButton = document.getElementById('signOutButton');
    if (signOutButton) {
        // Only add listener if not already attached
        if (!signOutButton._hasSignOutListener) {
            signOutButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🚪 Sign out button clicked');
                handleSignOut();
            });
            signOutButton._hasSignOutListener = true;
            console.log('✅ Sign out button listener added');
        } else {
            console.log('ℹ️ Sign out button listener already exists');
        }
    } else {
        console.warn('⚠️ Sign out button not found');
    }
    
    // Navigation tabs
    const navButtons = document.querySelectorAll('.nav-btn');
    if (navButtons.length > 0) {
        navButtons.forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                console.log('📊 Navigation button clicked:', e.target.dataset.view);
                const view = e.target.dataset.view || e.target.closest('.nav-btn').dataset.view;
                if (view) switchView(view);
            });
        });
        console.log(`✅ ${navButtons.length} navigation button listeners added`);
    } else {
        console.warn('❌ No navigation buttons found');
    }
    
    // Transaction form
    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', (e) => {
            console.log('📝 Transaction form submitted');
            handleAddTransaction(e);
        });
        console.log('✅ Transaction form listener added');
    } else {
        console.warn('❌ Transaction form not found');
    }
    
    // Edit form
    const editForm = document.getElementById('editTransactionForm');
    if (editForm) {
        editForm.addEventListener('submit', (e) => {
            console.log('✏️ Edit form submitted');
            handleEditTransaction(e);
        });
        console.log('✅ Edit form listener added');
    } else {
        console.log('ℹ️ Edit form not found (normal on page load)');
    }
    
    // Modal controls
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            console.log('❌ Close modal clicked');
            closeEditModal();
        });
    }
    
    const cancelEdit = document.getElementById('cancelEdit');
    if (cancelEdit) {
        cancelEdit.addEventListener('click', () => {
            console.log('🚫 Cancel edit clicked');
            closeEditModal();
        });
    }
    
    // Category form handler
    const categoryForm = document.getElementById('categoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('categoryName').value.trim();
            const selectedIcon = document.querySelector('.icon-option.active')?.getAttribute('data-icon') || 'fas fa-wallet';
            const editingId = categoryForm.getAttribute('data-editing');
            
            if (!name) {
                showToast('Please enter a category name!', 'error');
                return;
            }
            
            if (editingId) {
                // Edit existing category
                if (categories[editingId]) {
                    categories[editingId].name = name;
                    categories[editingId].icon = selectedIcon;
                    await saveCategories();
                    updateCategoryTabs();
                    updateCategoryList();
                    showToast('Category updated successfully!', 'success');
                    categoryForm.removeAttribute('data-editing');
                    closeCategoryModal();
                }
            } else {
                // Add new category
                if (await addCategory(name, selectedIcon)) {
                    closeCategoryModal();
                }
            }
        });
    }
    
    // Icon selector
    const iconOptions = document.querySelectorAll('.icon-option');
    iconOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            iconOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });
    
    // Close modals on outside click
    const categoryModal = document.getElementById('categoryModal');
    if (categoryModal) {
        categoryModal.addEventListener('click', (e) => {
            if (e.target === categoryModal) {
                closeCategoryModal();
            }
        });
    }
    
    const categoryManageModal = document.getElementById('categoryManageModal');
    if (categoryManageModal) {
        categoryManageModal.addEventListener('click', (e) => {
            if (e.target === categoryManageModal) {
                closeCategoryManageModal();
            }
        });
    }
    
    // Period selectors (in header)
    const dateSelector = document.getElementById('dateSelector');
    if (dateSelector) {
        dateSelector.addEventListener('change', () => {
            console.log('📅 Date selector changed:', dateSelector.value);
            updateUI();
        });
    }
    
    const monthSelector = document.getElementById('monthSelector');
    if (monthSelector) {
        monthSelector.addEventListener('change', () => {
            console.log('🗓️ Month selector changed:', monthSelector.value);
            updateUI();
        });
    }
    
    const yearSelector = document.getElementById('yearSelector');
    if (yearSelector) {
        yearSelector.addEventListener('change', () => {
            console.log('📆 Year selector changed:', yearSelector.value);
            updateUI();
        });
    }
    
    // Navigation arrows for period
    const prevPeriod = document.getElementById('prevPeriod');
    if (prevPeriod) {
        prevPeriod.addEventListener('click', () => {
            navigatePeriod(-1);
        });
    }
    
    const nextPeriod = document.getElementById('nextPeriod');
    if (nextPeriod) {
        nextPeriod.addEventListener('click', () => {
            navigatePeriod(1);
        });
    }
    
    // Go to Today button
    const goToToday = document.getElementById('goToToday');
    if (goToToday) {
        goToToday.addEventListener('click', () => {
            goToCurrentPeriod();
        });
    }
    
    // Quick period buttons in header
    const quickPeriodBtns = document.querySelectorAll('.quick-period-btn');
    quickPeriodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Handle different period types
            if (btn.dataset.period === 'today') {
                // Show today's transactions and enable left/right navigation
                const today = new Date().toISOString().split('T')[0];
                customStartDate = today;
                customEndDate = today;
                currentView = 'daily'; // Set to daily for navigation
                
                // Update date selector for navigation
                const dateSelector = document.getElementById('dateSelector');
                if (dateSelector) {
                    dateSelector.value = today;
                }
            } else if (btn.dataset.days) {
                // Show last X days
                const days = parseInt(btn.dataset.days);
                applyQuickPeriodRange(days);
            }
            
            // Update active state for period buttons only
            quickPeriodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Remove active from ALL button
            const allBtn = document.querySelector('.all-transactions-btn');
            if (allBtn) allBtn.classList.remove('active');
            
            // Update UI and force chart refresh
            updateUI();
            
            // Force chart update with a small delay to ensure DOM is updated
            setTimeout(() => {
                updateComparisonChart();
            }, 50);
        });
    });
    
    // Separate ALL button handler
    const allBtn = document.querySelector('.all-transactions-btn');
    if (allBtn) {
        allBtn.addEventListener('click', () => {
            // Show all transactions
            customStartDate = null;
            customEndDate = null;
            currentView = 'all';
            
            // Update active state
            quickPeriodBtns.forEach(b => b.classList.remove('active'));
            allBtn.classList.add('active');
            
            // Update UI
            updateUI();
        });
    }
    
    // Custom date range controls
    setupCustomRangeListeners();
    
    // Close modal on outside click
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                console.log('👆 Modal backdrop clicked');
                closeEditModal();
            }
        });
    }
    
    console.log('✅ Event listeners setup complete');
}

// Setup authentication modal form event listeners
function setupAuthModalListeners() {
    // Sign In Form
    const signInForm = document.getElementById('signInForm');
    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signInEmail').value;
            const password = document.getElementById('signInPassword').value;
            
            if (!email || !password) {
                showToast('Please fill in all fields', 'error');
                return;
            }
            
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                
                if (error) {
                    // Check if user not found or invalid credentials
                    if (error.message.toLowerCase().includes('invalid login credentials') || 
                        error.message.toLowerCase().includes('user not found') ||
                        error.message.toLowerCase().includes('invalid email or password')) {
                        showUserNotFoundPopup();
                        return;
                    }
                    throw error;
                }
                
                // User data will be saved to localStorage via auth state change listener
                currentUser = data.user;
                updateUIForAuth();
                await loadTransactions();
                updateUI();
                closeAuthModal();
                showToast('Signed in successfully!', 'success');
                console.log('\u2705 User signed in via form, session will be saved automatically');
            } catch (error) {
                showToast('Sign in failed: ' + error.message, 'error');
            }
        });
    }
    
    // Sign Up Form
    const signUpForm = document.getElementById('signUpForm');
    if (signUpForm) {
        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signUpName').value;
            const email = document.getElementById('signUpEmail').value;
            const password = document.getElementById('signUpPassword').value;
            const confirmPassword = document.getElementById('signUpPasswordConfirm').value;
            
            if (!name || !email || !password || !confirmPassword) {
                showToast('Please fill in all fields', 'error');
                return;
            }
            
            if (password !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }
            
            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }
            
            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: name },
                        emailRedirectTo: SITE_URL
                    }
                });
                
                if (error) throw error;
                
                if (data.user && !data.session) {
                    closeAuthModal();
                    showToast('Account created! Please check your email to verify. After clicking the verification link, return to https://expense-tracker-nh2v.vercel.app to continue.', 'success');
                } else {
                    currentUser = data.user;
                    updateUIForAuth();
                    await loadTransactions();
                    updateUI();
                    closeAuthModal();
                    showToast('Account created and signed in!', 'success');
                }
            } catch (error) {
                showToast('Sign up failed: ' + error.message, 'error');
            }
        });
    }
    
    // Initialize category system
    console.log('🏗️ Initializing category system...');
    
    // Ensure current transactions match active category
    transactions = categories[activeCategory].transactions;
    
    // Update category tabs in UI
    updateCategoryTabs();
    
    console.log(`✅ Category system initialized - Active: ${categories[activeCategory].name} (${transactions.length} transactions)`);
}

// Theme management with backend storage
function initializeTheme() {
    // Theme is already initialized from localStorage at page load
    // If user is logged in, load theme from backend to override localStorage
    if (currentUser && supabaseClient) {
        loadThemeFromBackend();
    }
    // If not logged in, theme is already set from localStorage at page load
}

// Load theme preference from backend (DISABLED - user_preferences table not created)
async function loadThemeFromBackend() {
    // Just use localStorage for theme - no backend table exists
    const localTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', localTheme);
    updateThemeIcon(localTheme);
}

// Save theme preference to backend (DISABLED - user_preferences table not created)
async function saveThemeToBackend(theme) {
    // Just save to localStorage - no backend table exists
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Apply theme immediately and save to localStorage
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
    
    console.log(`\ud83c\udfa8 Theme toggled to: ${newTheme}`);
    
    // Save to backend if user is logged in (don't wait for this)
    if (currentUser && supabaseClient) {
        saveThemeToBackend(newTheme).then(() => {
            showToast(`Theme switched to ${newTheme} mode`, 'success');
        }).catch(() => {
            showToast(`Theme switched to ${newTheme} mode (saved locally)`, 'info');
        });
    } else {
        showToast(`Theme switched to ${newTheme} mode`, 'success');
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// Set current date and update period display
function setCurrentDate() {
    // Use local date to avoid timezone issues
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;
    
    console.log('📅 Setting current date to:', today);
    
    const dateField = document.getElementById('date');
    if (dateField) {
        dateField.value = today;
        console.log('✅ Date field set to:', dateField.value);
    } else {
        console.error('❌ Date field not found');
    }
    
    const currentMonth = `${year}-${month}`;
    if (document.getElementById('monthFilter')) {
        document.getElementById('monthFilter').value = currentMonth;
        console.log('📅 Month filter set to:', currentMonth);
    }
    
    if (document.getElementById('yearFilter')) {
        document.getElementById('yearFilter').value = year;
        console.log('📅 Year filter set to:', year);
    }
    
    // Set period selectors (in header)
    const dateSelector = document.getElementById('dateSelector');
    if (dateSelector) {
        dateSelector.value = today;
        console.log('📅 Date selector set to:', today);
    }
    
    const monthSelector = document.getElementById('monthSelector');
    if (monthSelector) {
        monthSelector.value = currentMonth;
        console.log('🗓️ Month selector set to:', currentMonth);
    }
    
    const yearSelector = document.getElementById('yearSelector');
    if (yearSelector) {
        yearSelector.value = year;
        console.log('📆 Year selector set to:', year);
    }
    
    // Update period display
    updatePeriodDisplay();
}

// Update period display based on current view
function updatePeriodDisplay() {
    const now = new Date();
    const periodDisplay = document.getElementById('currentPeriodDisplay');
    const dateDetails = document.getElementById('currentDateDetails');
    
    if (!periodDisplay || !dateDetails) return;
    
    if (currentView === 'daily') {
        const dateSelector = document.getElementById('dateSelector');
        let displayDate = now;
        if (dateSelector && dateSelector.value) {
            displayDate = new Date(dateSelector.value + 'T00:00:00');
        }
        const dateStr = displayDate.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        periodDisplay.textContent = "Daily Summary";
        dateDetails.innerHTML = `${dateStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
    } else if (currentView === 'monthly') {
        const monthSelector = document.getElementById('monthSelector');
        let displayDate = now;
        if (monthSelector && monthSelector.value) {
            const [year, month] = monthSelector.value.split('-');
            displayDate = new Date(year, month - 1, 1);
        }
        const monthStr = displayDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long'
        });
        periodDisplay.textContent = "Monthly Summary";
        dateDetails.innerHTML = `${monthStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
    } else if (currentView === 'yearly') {
        const yearSelector = document.getElementById('yearSelector');
        let displayYear = now.getFullYear();
        if (yearSelector && yearSelector.value) {
            displayYear = yearSelector.value;
        }
        periodDisplay.textContent = "Yearly Summary";
        dateDetails.innerHTML = `Year ${displayYear}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
    } else if (currentView === 'custom') {
        periodDisplay.textContent = "Custom Range";
        if (customStartDate && customEndDate) {
            const startStr = new Date(customStartDate + 'T00:00:00').toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
            const endStr = new Date(customEndDate + 'T00:00:00').toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
            });
            dateDetails.innerHTML = `${startStr} - ${endStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
        } else {
            dateDetails.innerHTML = 'Select a date range<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>';
        }
    }
    
    // Update transaction count
    updateTransactionCount();
}

// Update transaction count display
function updateTransactionCount() {
    console.log('🔢 updateTransactionCount called');
    
    // Wait for DOM to be ready if called too early
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', updateTransactionCount);
        return;
    }
    
    const countElement = document.getElementById('transactionCount'); // Legacy element
    const headerCountElement = document.getElementById('transactionCountHeader'); // Header element
    
    const filteredTransactions = getFilteredTransactions();
    const count = filteredTransactions.length;
    const countText = count === 1 ? '1 transaction' : `${count} transactions`;
    
    console.log(`📊 Transaction count: ${count}, filtered transactions:`, filteredTransactions.length);
    
    // Update legacy element if it exists
    if (countElement) {
        countElement.textContent = countText;
        console.log('✅ Updated legacy transaction count element');
    }
    
    // Update header element
    if (headerCountElement) {
        headerCountElement.textContent = `• ${countText}`;
        console.log('✅ Updated header transaction count element');
    } else {
        console.log('❌ Header transaction count element not found');
        console.log('🔍 DOM readyState:', document.readyState);
        console.log('🔍 Available elements with transaction in ID:', 
            Array.from(document.querySelectorAll('[id*="transaction"]')).map(el => el.id));
    }
}

// Transaction management
async function handleAddTransaction(e) {
    e.preventDefault();
    console.log('📝 Processing transaction form...');
    
    // Get form values directly from DOM elements
    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const type = document.getElementById('type').value;
    const dateInput = document.getElementById('date').value;
    
    // Use type as category (expense or income)
    const category = type;
    
    // Ensure date is in YYYY-MM-DD format
    let date = dateInput;
    if (dateInput) {
        // If date is in DD/MM/YYYY format, convert to YYYY-MM-DD
        if (dateInput.includes('/')) {
            const parts = dateInput.split('/');
            if (parts.length === 3) {
                // Assume DD/MM/YYYY format
                const [day, month, year] = parts;
                date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                console.log('📅 Converted date from', dateInput, 'to', date);
            }
        }
    } else {
        // If no date provided, use today
        date = new Date().toISOString().split('T')[0];
        console.log('📅 Using today\'s date:', date);
    }
    
    const transaction = {
        id: Date.now().toString(),
        description: description,
        amount: amount,
        category: category,
        type: type,
        date: date,
        createdAt: new Date().toISOString()
    };
    
    console.log('📋 Transaction data:', transaction);
    
    if (validateTransaction(transaction)) {
        console.log('✅ Transaction validation passed');
        
        // Add to active category's transactions
        categories[activeCategory].transactions.push(transaction);
        
        // Update current transactions reference to active category
        transactions = categories[activeCategory].transactions;
        
        // Save all categories
        saveTransactions();
        console.log(`💾 Transaction saved to category: ${categories[activeCategory].name}`);
        
        // Update UI immediately
        updateUI();
        console.log('🔄 UI updated for active category');
        
        if (currentUser && supabaseClient) {
            // Save directly to database
            try {
                console.log('📤 Saving transaction to database...');
                console.log('👤 Current user:', currentUser.id, currentUser.email);
                
                const insertData = {
                    user_id: currentUser.id,
                    description: transaction.description,
                    amount: transaction.amount,
                    category: transaction.category,
                    type: transaction.type,
                    date: transaction.date
                };
                
                console.log('📊 Transaction data to save:', insertData);
                
                // Make direct fetch request to Supabase REST API (skip session check)
                console.log('🔄 Making direct fetch to Supabase...');
                
                // Get access token from Supabase's internal storage
                const authData = localStorage.getItem('expense-tracker-auth');
                let accessToken = null;
                
                if (authData) {
                    try {
                        const parsed = JSON.parse(authData);
                        accessToken = parsed?.access_token;
                        console.log('🔐 Access token from localStorage:', accessToken ? 'Found' : 'Not found');
                    } catch (e) {
                        console.error('❌ Error parsing auth data:', e);
                    }
                }
                
                if (!accessToken) {
                    console.error('❌ No access token available');
                    showToast('Authentication error - please sign in again', 'error');
                    return;
                }
                
                const response = await fetch(`${SUPABASE_URL}/rest/v1/transactions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(insertData)
                });
                
                console.log('📥 Response status:', response.status);
                console.log('📥 Response statusText:', response.statusText);
                
                const responseText = await response.text();
                console.log('📥 Response body:', responseText);
                
                if (!response.ok) {
                    console.error('❌ Database insert failed:', response.status, responseText);
                    showToast('Database error: ' + responseText, 'error');
                    return;
                }
                
                const data = responseText ? JSON.parse(responseText) : null;
                console.log('✅ Database save successful!');
                console.log('📊 Saved data:', data);
                
                // Replace localStorage transaction with database version
                // Note: Supabase returns an array, so we need to get the first element
                const savedTransaction = Array.isArray(data) ? data[0] : data;
                if (savedTransaction) {
                    transactions.pop(); // Remove the localStorage version
                    transactions.unshift(savedTransaction); // Add database version at the beginning
                    saveTransactions(); // Save updated list to localStorage
                    console.log('🔄 Replaced localStorage transaction with database version');
                }
                
                showToast('Transaction saved to database!', 'success');
                
                // Update UI with database data
                console.log('🔄 Updating UI with database transaction...');
                updateUI();
                
            } catch (error) {
                console.error('❌ Database operation failed:', error.message);
                console.error('❌ Full error:', error);
                
                // Check if it's a permissions/auth error
                if (error.message && (error.message.includes('JWT') || error.message.includes('auth') || error.message.includes('permission'))) {
                    showToast('Authentication error - please sign out and sign in again', 'error');
                } else if (error.message && error.message.includes('policy')) {
                    showToast('RLS Policy error - check database policies', 'error');
                } else {
                    showToast('Database error: ' + (error.message || 'Unknown error'), 'error');
                }
                
                console.log('💾 Using localStorage backup since database failed');
            }
        } else {
            console.log('💾 No database connection, using localStorage only');
            showToast('Transaction saved locally!', 'success');
        }
        
        // Always reset form after successful save (localStorage backup ensures data isn't lost)
        e.target.reset();
        setCurrentDate();
        
        // Reset category options back to expense and hide custom income source
        updateCategoryOptions('type', 'category', 'customIncomeSourceGroup');
        document.getElementById('customIncomeSource').value = '';
        document.getElementById('customIncomeSourceGroup').style.display = 'none';
        
        console.log('✅ Transaction processing complete');
    } else {
        console.log('❌ Transaction validation failed');
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
    document.getElementById('editType').value = transaction.type;
    document.getElementById('editDate').value = transaction.date;
    
    // Show modal
    document.getElementById('editModal').style.display = 'flex';
    document.getElementById('editModal').classList.add('fade-in');
}

async function handleEditTransaction(e) {
    e.preventDefault();
    
    const id = document.getElementById('editId').value;
    const existingTransaction = transactions.find(t => t.id === id);
    
    const type = document.getElementById('editType').value;
    // Use type as category
    const category = type;
    
    const updatedTransaction = {
        id: id,
        description: document.getElementById('editDescription').value,
        amount: parseFloat(document.getElementById('editAmount').value),
        category: category,
        type: type,
        date: document.getElementById('editDate').value,
        createdAt: existingTransaction?.createdAt || existingTransaction?.created_at || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    if (validateTransaction(updatedTransaction)) {
        const index = transactions.findIndex(t => t.id === id);
        if (index !== -1) {
            // Update in Supabase if authenticated
            if (currentUser && supabaseClient) {
                try {
                    console.log('📤 Updating transaction in database...');
                    
                    // Get access token
                    const authData = localStorage.getItem('expense-tracker-auth');
                    let accessToken = null;
                    
                    if (authData) {
                        try {
                            const parsed = JSON.parse(authData);
                            accessToken = parsed?.access_token;
                        } catch (e) {
                            console.error('❌ Error parsing auth data:', e);
                        }
                    }
                    
                    if (!accessToken) {
                        console.error('❌ No access token available');
                        showToast('Authentication error - please sign in again', 'error');
                        return;
                    }
                    
                    const updateData = {
                        description: updatedTransaction.description,
                        amount: updatedTransaction.amount,
                        category: updatedTransaction.category,
                        type: updatedTransaction.type,
                        date: updatedTransaction.date
                    };
                    
                    const response = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${accessToken}`,
                            'Prefer': 'return=representation'
                        },
                        body: JSON.stringify(updateData)
                    });
                    
                    console.log('📥 Update response status:', response.status);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('❌ Database update failed:', response.status, errorText);
                        showToast('Database error: ' + errorText, 'error');
                        return;
                    }
                    
                    console.log('✅ Database update successful!');
                    
                } catch (error) {
                    console.error('❌ Error updating in database:', error);
                    showToast('Error saving to database: ' + error.message, 'error');
                    return;
                }
            }
            
            // Update local array in active category
            categories[activeCategory].transactions[index] = updatedTransaction;
            
            // Update current transactions reference
            transactions = categories[activeCategory].transactions;
            
            saveTransactions();
            updateUI();
            closeEditModal();
            showToast('Transaction updated successfully!', 'success');
        }
    }
}

async function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        // Delete from Supabase if authenticated
        if (currentUser && supabaseClient) {
            try {
                console.log('🗑️ Deleting transaction from database...');
                
                // Get access token
                const authData = localStorage.getItem('expense-tracker-auth');
                let accessToken = null;
                
                if (authData) {
                    try {
                        const parsed = JSON.parse(authData);
                        accessToken = parsed?.access_token;
                    } catch (e) {
                        console.error('❌ Error parsing auth data:', e);
                    }
                }
                
                if (!accessToken) {
                    console.error('❌ No access token available');
                    showToast('Authentication error - please sign in again', 'error');
                    return;
                }
                
                const response = await fetch(`${SUPABASE_URL}/rest/v1/transactions?id=eq.${id}`, {
                    method: 'DELETE',
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`
                    }
                });
                
                console.log('📥 Delete response status:', response.status);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Database delete failed:', response.status, errorText);
                    showToast('Database error: ' + errorText, 'error');
                    return;
                }
                
                console.log('✅ Database delete successful!');
                
            } catch (error) {
                console.error('❌ Error deleting from database:', error);
                showToast('Error deleting from database: ' + error.message, 'error');
                return;
            }
        }
        
        // Remove from active category's transactions
        categories[activeCategory].transactions = categories[activeCategory].transactions.filter(t => t.id !== id);
        
        // Update current transactions reference
        transactions = categories[activeCategory].transactions;
        
        saveTransactions();
        updateUI();
        showToast('Transaction deleted successfully!', 'success');
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
    
    // Show/hide custom range section
    const customRangeSection = document.getElementById('customRangeSection');
    if (customRangeSection) {
        customRangeSection.style.display = view === 'custom' ? 'block' : 'none';
    }
    
    // Show/hide period header nav buttons for custom view
    const periodHeader = document.querySelector('.current-period-header');
    const prevBtn = document.getElementById('prevPeriod');
    const nextBtn = document.getElementById('nextPeriod');
    if (view === 'custom') {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
    } else {
        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
    }
    
    // Show/hide appropriate date selector based on view
    const dateSelector = document.getElementById('dateSelector');
    const monthSelector = document.getElementById('monthSelector');
    const yearSelector = document.getElementById('yearSelector');
    
    if (dateSelector) dateSelector.style.display = view === 'daily' ? 'block' : 'none';
    if (monthSelector) monthSelector.style.display = view === 'monthly' ? 'block' : 'none';
    if (yearSelector) yearSelector.style.display = view === 'yearly' ? 'block' : 'none';
    
    updateUI();
}

// Navigate to previous/next period
function navigatePeriod(direction) {
    const dateSelector = document.getElementById('dateSelector');
    const monthSelector = document.getElementById('monthSelector');
    const yearSelector = document.getElementById('yearSelector');
    
    if (currentView === 'daily' && dateSelector) {
        // Navigate by day
        const currentDate = new Date(dateSelector.value + 'T00:00:00');
        currentDate.setDate(currentDate.getDate() + direction);
        dateSelector.value = formatDateForInput(currentDate);
        console.log('📅 Navigated to:', dateSelector.value);
    } else if (currentView === 'monthly' && monthSelector) {
        // Navigate by month
        const [year, month] = monthSelector.value.split('-').map(Number);
        const newDate = new Date(year, month - 1 + direction, 1);
        monthSelector.value = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;
        console.log('🗓️ Navigated to:', monthSelector.value);
    } else if (currentView === 'yearly' && yearSelector) {
        // Navigate by year
        yearSelector.value = parseInt(yearSelector.value) + direction;
        console.log('📆 Navigated to:', yearSelector.value);
    }
    
    updateUI();
}

// Go to current period (today/this month/this year)
function goToCurrentPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    // Reset to 'all' view and clear custom date ranges
    currentView = 'all';
    customStartDate = null;
    customEndDate = null;
    
    // Update nav buttons to show daily view is active (if they exist)
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const dailyBtn = document.querySelector('.nav-btn[data-view="daily"]');
    if (dailyBtn) dailyBtn.classList.add('active');
    
    // Update quick period buttons - remove active from period buttons
    document.querySelectorAll('.quick-period-btn').forEach(btn => btn.classList.remove('active'));
    
    // Update ALL button to show it's active
    const allBtn = document.querySelector('.all-transactions-btn');
    if (allBtn) allBtn.classList.add('active');
    
    // Hide custom range section if visible
    const customRangeSection = document.getElementById('customRangeSection');
    if (customRangeSection) {
        customRangeSection.style.display = 'none';
    }
    
    // Clear active state from quick period buttons
    document.querySelectorAll('.quick-period-btn').forEach(btn => btn.classList.remove('active'));
    
    const dateSelector = document.getElementById('dateSelector');
    const monthSelector = document.getElementById('monthSelector');
    const yearSelector = document.getElementById('yearSelector');
    
    if (dateSelector) dateSelector.value = `${year}-${month}-${day}`;
    if (monthSelector) monthSelector.value = `${year}-${month}`;
    if (yearSelector) yearSelector.value = year;
    
    updateUI();
    showToast('Jumped to current period!', 'success');
}

// Format date for input field
function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Data persistence with user separation
// Category Management Functions
function switchCategory(categoryId) {
    if (!categories[categoryId]) return;
    
    // Update active category
    activeCategory = categoryId;
    
    // Update UI
    document.querySelectorAll('.category-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-category="${categoryId}"]`).classList.add('active');
    
    // Load transactions for this category
    transactions = categories[activeCategory].transactions;
    
    // Update the UI
    updateUI();
    
    console.log(`🔄 Switched to category: ${categories[activeCategory].name}`);
}

async function addCategory(name, icon) {
    const categoryId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (categories[categoryId]) {
        showToast('Category already exists!', 'error');
        return false;
    }
    
    categories[categoryId] = {
        name: name,
        icon: icon,
        transactions: []
    };
    
    await saveCategories();
    updateCategoryTabs();
    showToast(`Category "${name}" added successfully!`, 'success');
    return true;
}

async function deleteCategory(categoryId) {
    if (categoryId === 'daily') {
        showToast('Cannot delete the default Daily Expenses category!', 'error');
        return false;
    }
    
    if (categories[categoryId]) {
        delete categories[categoryId];
        
        // If current category was deleted, switch to daily
        if (activeCategory === categoryId) {
            switchCategory('daily');
        }
        
        await saveCategories();
        updateCategoryTabs();
        showToast('Category deleted successfully!', 'success');
        return true;
    }
    return false;
}

function saveTransactions() {
    if (!currentUserId) return;
    
    // Save current category's transactions
    categories[activeCategory].transactions = transactions;
    
    // Save all categories
    const key = `categories_${currentUserId}`;
    localStorage.setItem(key, JSON.stringify(categories));
    
    // Also save user's last activity
    localStorage.setItem(`lastActivity_${currentUserId}`, new Date().toISOString());
}

async function saveCategories() {
    if (!currentUserId) return;
    
    // Save to localStorage as backup
    const key = `categories_${currentUserId}`;
    localStorage.setItem(key, JSON.stringify(categories));
    console.log('💾 Categories saved to localStorage');
    
    // Save to Supabase backend if authenticated
    if (currentUser && supabaseClient) {
        try {
            console.log('📤 Saving categories to database...');
            
            // Get access token
            const authData = localStorage.getItem('expense-tracker-auth');
            let accessToken = null;
            
            if (authData) {
                try {
                    const parsed = JSON.parse(authData);
                    accessToken = parsed?.access_token;
                } catch (e) {
                    console.error('❌ Error parsing auth data:', e);
                }
            }
            
            if (!accessToken) {
                console.log('⚠️ No access token, categories saved to localStorage only');
                return;
            }
            
            // Prepare categories data for backend
            const categoriesData = {
                user_id: currentUser.id,
                categories_json: JSON.stringify(categories),
                updated_at: new Date().toISOString()
            };
            
            // Check if user categories already exist
            const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/user_categories?user_id=eq.${currentUser.id}&select=id`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            
            if (!checkResponse.ok) {
                console.error('❌ Error checking existing categories:', checkResponse.status);
                return;
            }
            
            const existing = await checkResponse.json();
            const method = existing.length > 0 ? 'PATCH' : 'POST';
            const url = existing.length > 0 
                ? `${SUPABASE_URL}/rest/v1/user_categories?user_id=eq.${currentUser.id}`
                : `${SUPABASE_URL}/rest/v1/user_categories`;
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(categoriesData)
            });
            
            if (response.ok) {
                console.log('✅ Categories saved to database successfully!');
            } else {
                const errorText = await response.text();
                console.error('❌ Database save failed:', response.status, errorText);
                showToast('Failed to sync categories to cloud', 'warning');
            }
            
        } catch (error) {
            console.error('❌ Error saving categories to database:', error);
            showToast('Error syncing categories: ' + error.message, 'warning');
        }
    }
}

async function loadTransactions() {
    console.log('🔄 Loading transactions and categories...');
    
    // First, try to load categories from backend
    if (currentUser && supabaseClient) {
        const categoriesLoaded = await loadCategories();
        if (!categoriesLoaded) {
            console.log('📂 Loading categories from localStorage as fallback...');
        }
    }
    
    if (currentUser && supabaseClient) {
        // Load from Supabase database using direct fetch (faster than client)
        try {
            console.log('📡 Loading transactions from Supabase database for user:', currentUser.email);
            
            // Get access token from localStorage
            const authData = localStorage.getItem('expense-tracker-auth');
            let accessToken = null;
            
            if (authData) {
                try {
                    const parsed = JSON.parse(authData);
                    accessToken = parsed?.access_token;
                } catch (e) {
                    console.error('❌ Error parsing auth data:', e);
                }
            }
            
            if (!accessToken) {
                console.log('⚠️ No access token, falling back to localStorage');
                loadFromLocalStorage();
                return;
            }
            
            // Use direct fetch for faster response
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/transactions?select=*&user_id=eq.${currentUser.id}&order=created_at.desc`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            transactions = data || [];
            console.log(`✅ Loaded ${transactions.length} transactions from database`);
            if (transactions.length > 0) {
                console.log('📊 Sample transaction:', transactions[0]);
            }
            
            // Also save to localStorage as backup
            saveTransactions();
            
        } catch (error) {
            console.error('❌ Error loading from database:', error.message);
            console.log('📂 Falling back to localStorage...');
            loadFromLocalStorage();
        }
    } else {
        // Load from localStorage
        console.log('💾 Loading from localStorage (no user/supabase)');
        loadFromLocalStorage();
        loadFromLocalStorage();
    }
}

async function loadCategories() {
    if (!currentUser || !supabaseClient) {
        console.log('⚠️ No user authenticated, loading categories from localStorage only');
        return false;
    }
    
    try {
        console.log('📡 Loading categories from database...');
        
        // Get access token
        const authData = localStorage.getItem('expense-tracker-auth');
        let accessToken = null;
        
        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                accessToken = parsed?.access_token;
            } catch (e) {
                console.error('❌ Error parsing auth data:', e);
            }
        }
        
        if (!accessToken) {
            console.log('⚠️ No access token, loading from localStorage');
            return false;
        }
        
        const response = await fetch(`${SUPABASE_URL}/rest/v1/user_categories?user_id=eq.${currentUser.id}&select=*`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            console.error('❌ Error loading categories from database:', response.status);
            return false;
        }
        
        const data = await response.json();
        
        if (data.length > 0) {
            const categoriesData = data[0];
            categories = JSON.parse(categoriesData.categories_json);
            console.log(`✅ Categories loaded from database: ${Object.keys(categories).length} categories`);
            
            // Save to localStorage as cache
            const key = `categories_${currentUserId}`;
            localStorage.setItem(key, JSON.stringify(categories));
            
            return true;
        } else {
            console.log('ℹ️ No categories found in database');
            return false;
        }
        
    } catch (error) {
        console.error('❌ Error loading categories from database:', error);
        return false;
    }
}

function loadFromLocalStorage() {
    if (!currentUserId) {
        // Create a temporary user for localStorage
        currentUserId = localStorage.getItem('tempUserId') || 'temp_' + Date.now();
        localStorage.setItem('tempUserId', currentUserId);
    }
    
    // Load categories first
    const categoriesKey = `categories_${currentUserId}`;
    const savedCategories = localStorage.getItem(categoriesKey);
    
    if (savedCategories) {
        categories = JSON.parse(savedCategories);
        console.log(`Loaded ${Object.keys(categories).length} categories from localStorage`);
    } else {
        // Check for legacy transactions
        const legacyKey = `transactions_${currentUserId}`;
        const legacyData = localStorage.getItem(legacyKey);
        if (legacyData) {
            const legacyTransactions = JSON.parse(legacyData);
            // Migrate to daily category
            categories['daily'].transactions = legacyTransactions;
            saveCategories();
            console.log(`Migrated ${legacyTransactions.length} transactions to Daily category`);
        }
    }
    
    // Set transactions to active category
    transactions = categories[activeCategory].transactions;
    console.log(`Loaded ${transactions.length} transactions for category: ${categories[activeCategory].name}`);
}

function clearTransactions() {
    transactions = [];
    updateUI();
}

// Category Modal Functions
function openCategoryModal() {
    document.getElementById('categoryModalTitle').textContent = 'Add New Category';
    document.getElementById('categoryName').value = '';
    document.getElementById('categorySubmitText').textContent = 'Add Category';
    
    // Reset icon selection
    document.querySelectorAll('.icon-option').forEach(option => option.classList.remove('active'));
    document.querySelector('.icon-option').classList.add('active');
    
    document.getElementById('categoryModal').style.display = 'flex';
}

function closeCategoryModal() {
    document.getElementById('categoryModal').style.display = 'none';
}

function openCategoryManageModal() {
    updateCategoryList();
    document.getElementById('categoryManageModal').style.display = 'flex';
}

function closeCategoryManageModal() {
    document.getElementById('categoryManageModal').style.display = 'none';
}

function updateCategoryTabs() {
    const categoryTabs = document.querySelector('.category-tabs');
    if (!categoryTabs) return;
    
    // Clear existing tabs except add button
    const addButton = categoryTabs.querySelector('.add-category');
    categoryTabs.innerHTML = '';
    
    // Add category tabs
    Object.entries(categories).forEach(([id, category]) => {
        const tab = document.createElement('div');
        tab.className = `category-tab ${id === activeCategory ? 'active' : ''}`;
        tab.setAttribute('data-category', id);
        tab.onclick = () => switchCategory(id);
        tab.innerHTML = `
            <i class="${category.icon}"></i>
            <span>${category.name}</span>
        `;
        categoryTabs.appendChild(tab);
    });
    
    // Re-add the add button
    if (addButton) {
        categoryTabs.appendChild(addButton);
    }
}

function updateCategoryList() {
    const categoryList = document.getElementById('categoryList');
    if (!categoryList) return;
    
    categoryList.innerHTML = '';
    
    Object.entries(categories).forEach(([id, category]) => {
        const isDefault = id === 'daily';
        const item = document.createElement('div');
        item.className = 'category-item';
        item.innerHTML = `
            <div class="category-info">
                <i class="${category.icon}"></i>
                <span>${category.name}</span>
                <small>(${category.transactions.length} transactions)</small>
            </div>
            <div class="category-item-actions">
                ${!isDefault ? `
                    <button class="category-action-btn" onclick="editCategory('${id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="category-action-btn delete" onclick="confirmDeleteCategory('${id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : `
                    <span style="color: var(--text-secondary); font-size: 0.8rem;">Default</span>
                `}
            </div>
        `;
        categoryList.appendChild(item);
    });
}

async function confirmDeleteCategory(categoryId) {
    const category = categories[categoryId];
    if (!category) return;
    
    const hasTransactions = category.transactions.length > 0;
    const message = hasTransactions 
        ? `Delete "${category.name}" category? This will permanently delete ${category.transactions.length} transactions.`
        : `Delete "${category.name}" category?`;
    
    if (confirm(message)) {
        await deleteCategory(categoryId);
        updateCategoryList();
    }
}

function editCategory(categoryId) {
    const category = categories[categoryId];
    if (!category) return;
    
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categorySubmitText').textContent = 'Save Changes';
    
    // Set icon selection
    document.querySelectorAll('.icon-option').forEach(option => {
        option.classList.remove('active');
        if (option.getAttribute('data-icon') === category.icon) {
            option.classList.add('active');
        }
    });
    
    // Store editing category ID
    document.getElementById('categoryForm').setAttribute('data-editing', categoryId);
    document.getElementById('categoryModal').style.display = 'flex';
}

// UI updates
function updateUI() {
    console.log(`🔄 Updating UI for category "${categories[activeCategory].name}" with ${transactions.length} transactions`);
    updateCategoryTabs();
    updateSummary();
    renderTransactions();
    updateCurrentPeriodDisplay();
    updateTransactionCount(); // Add this to ensure count is always updated
    updateComparisonChart();
}

function updateCurrentPeriodDisplay() {
    const displayElement = document.getElementById('currentPeriodDisplay');
    const dateDetails = document.getElementById('currentDateDetails');
    if (!displayElement) return;
    
    const now = new Date();
    const dateSelector = document.getElementById('dateSelector')?.value;
    const monthSelector = document.getElementById('monthSelector')?.value;
    const yearSelector = document.getElementById('yearSelector')?.value;
    
    // Handle 'all' view first
    if (currentView === 'all') {
        displayElement.textContent = 'All Transactions';
        if (dateDetails) dateDetails.innerHTML = 'Complete transaction history<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>';
    } else if (currentView === 'custom' && customStartDate && customEndDate) {
        // Handle custom date ranges (including TODAY, LAST 7D, etc.)
        if (customStartDate === customEndDate) {
            // Single day selection
            const selectedDate = new Date(customStartDate + 'T00:00:00');
            const today = now.toISOString().split('T')[0];
            const isToday = customStartDate === today;
            
            displayElement.textContent = isToday ? "Today's Summary" : "Daily Summary";
            if (dateDetails) {
                const dateStr = selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                dateDetails.innerHTML = `${dateStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        } else {
            // Date range selection
            const startDate = new Date(customStartDate + 'T00:00:00');
            const endDate = new Date(customEndDate + 'T00:00:00');
            
            displayElement.textContent = 'Custom Range';
            if (dateDetails) {
                const startStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endStr = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                dateDetails.innerHTML = `${startStr} - ${endStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        }
    } else if (currentView === 'daily') {
        // Show selected date or today
        if (dateSelector) {
            const selectedDate = new Date(dateSelector + 'T00:00:00');
            const today = now.toISOString().split('T')[0];
            const isToday = dateSelector === today;
            displayElement.textContent = isToday ? "Today's Summary" : "Daily Summary";
            if (dateDetails) {
                const dateStr = selectedDate.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                dateDetails.innerHTML = `${dateStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        } else {
            displayElement.textContent = "Today's Summary";
            if (dateDetails) {
                const dateStr = now.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                dateDetails.innerHTML = `${dateStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        }
    } else if (currentView === 'monthly') {
        // Show selected month or current month
        if (monthSelector) {
            const selectedMonth = new Date(monthSelector + '-01');
            const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const isCurrentMonth = monthSelector === currentMonthStr;
            displayElement.textContent = isCurrentMonth ? "This Month's Summary" : "Monthly Summary";
            if (dateDetails) {
                const monthStr = selectedMonth.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long' 
                });
                dateDetails.innerHTML = `${monthStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        } else {
            displayElement.textContent = "This Month's Summary";
            if (dateDetails) {
                const monthStr = now.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long' 
                });
                dateDetails.innerHTML = `${monthStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
            }
        }
    } else if (currentView === 'yearly') {
        const selectedYear = yearSelector || now.getFullYear().toString();
        const isCurrentYear = selectedYear === now.getFullYear().toString();
        displayElement.textContent = isCurrentYear ? "This Year's Summary" : "Yearly Summary";
        if (dateDetails) dateDetails.innerHTML = `Year ${selectedYear}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
    } else {
        // Default fallback
        displayElement.textContent = "Today's Summary";
        if (dateDetails) {
            const dateStr = now.toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            dateDetails.innerHTML = `${dateStr}<span id="transactionCountHeader" class="transaction-count-badge">• 0 transactions</span>`;
        }
    }
    
    // Update transaction count
    updateTransactionCount();
}

function updateSummary() {
    const filteredTransactions = getFilteredTransactions();
    console.log('📊 Updating summary with transactions:', filteredTransactions.length);
    
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const balance = totalIncome - totalExpenses;
    
    console.log('💰 Summary calculations:', { totalIncome, totalExpenses, balance });
    
    // Calculate averages for current period
    const { avgIncome, avgExpense, avgBalance, dayCount } = calculateAverages(filteredTransactions);
    
    // Update labels based on current view
    const incomeLabel = document.getElementById('incomeLabel');
    const expenseLabel = document.getElementById('expenseLabel');
    const balanceLabel = document.getElementById('balanceLabel');
    
    let periodText = '';
    if (currentView === 'daily') {
        periodText = "Today's";
    } else if (currentView === 'monthly') {
        periodText = "Monthly";
    } else if (currentView === 'yearly') {
        periodText = "Yearly";
    } else if (currentView === 'custom') {
        periodText = "Range";
    }
    
    if (incomeLabel) incomeLabel.textContent = `${periodText} Income`;
    if (expenseLabel) expenseLabel.textContent = `${periodText} Expenses`;
    if (balanceLabel) balanceLabel.textContent = `${periodText} Balance`;
    
    // Check if elements exist before updating
    const incomeEl = document.getElementById('totalIncome');
    const expensesEl = document.getElementById('totalExpenses');
    const balanceEl = document.getElementById('balance');
    
    if (incomeEl) {
        incomeEl.textContent = formatCurrency(totalIncome);
        console.log('✅ Updated total income:', incomeEl.textContent);
    } else {
        console.error('❌ Total income element not found');
    }
    
    if (expensesEl) {
        expensesEl.textContent = formatCurrency(totalExpenses);
        console.log('✅ Updated total expenses:', expensesEl.textContent);
    } else {
        console.error('❌ Total expenses element not found');
    }
    
    if (balanceEl) {
        balanceEl.textContent = formatCurrency(balance);
        // Update balance color
        balanceEl.style.color = balance >= 0 ? 'var(--success-color)' : 'var(--error-color)';
        console.log('✅ Updated balance:', balanceEl.textContent);
    } else {
        console.error('❌ Balance element not found');
    }
    
    // Update average texts
    const avgIncomeEl = document.getElementById('avgIncomeText');
    const avgExpenseEl = document.getElementById('avgExpenseText');
    const avgBalanceEl = document.getElementById('avgBalanceText');
    
    if (avgIncomeEl) {
        avgIncomeEl.textContent = `Avg: ${formatCurrency(avgIncome)}/day`;
    }
    
    if (avgExpenseEl) {
        avgExpenseEl.textContent = `Avg: ${formatCurrency(avgExpense)}/day`;
    }
    
    if (avgBalanceEl) {
        avgBalanceEl.textContent = `Avg: ${formatCurrency(avgBalance)}/day`;
    }
    
    // Update transaction count in header
    updateTransactionCount();
}

// Calculate daily averages for current filtered period
function calculateAverages(transactions) {
    if (transactions.length === 0) {
        return { avgIncome: 0, avgExpense: 0, avgBalance: 0, dayCount: 0 };
    }
    
    // Get unique days in the filtered period
    const uniqueDates = [...new Set(transactions.map(t => t.date))];
    const dayCount = uniqueDates.length || 1;
    
    const totalIncome = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    return {
        avgIncome: totalIncome / dayCount,
        avgExpense: totalExpenses / dayCount,
        avgBalance: (totalIncome - totalExpenses) / dayCount,
        dayCount
    };
}

// Get all transactions from all categories
function getAllTransactions() {
    const allTransactions = [];
    
    // Collect from all categories
    Object.values(categories).forEach(category => {
        if (category.transactions && Array.isArray(category.transactions)) {
            allTransactions.push(...category.transactions);
        }
    });
    
    return allTransactions;
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
                <div class="category-icon ${transaction.type}">
                    ${transaction.type === 'income' ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>'}
                </div>
                <div class="transaction-info">
                    <h4>${transaction.description}</h4>
                    <p>${formatDate(transaction.date)} • ${transaction.type === 'income' ? 'Income' : 'Expense'}</p>
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
    console.log('🔍 Starting with', filtered.length, 'total transactions');
    
    // Get selected values from period selectors
    const dateSelector = document.getElementById('dateSelector')?.value;
    const monthSelector = document.getElementById('monthSelector')?.value;
    const yearSelector = document.getElementById('yearSelector')?.value;
    
    // Use local date as fallback
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayDefault = `${year}-${month}-${day}`;
    const monthDefault = `${year}-${month}`;
    
    console.log('📅 Current view:', currentView);
    console.log('📅 Selectors:', { dateSelector, monthSelector, yearSelector });
    
    if (currentView === 'daily') {
        // Use selected date or today
        const selectedDate = dateSelector || todayDefault;
        console.log('📅 Filtering for date:', selectedDate);
        filtered = filtered.filter(t => {
            const transactionDate = t.date || '';
            if (!transactionDate) return false;
            return transactionDate === selectedDate;
        });
    } else if (currentView === 'monthly') {
        // Use selected month or current month
        const selectedMonth = monthSelector || monthDefault;
        console.log('🗓️ Filtering for month:', selectedMonth);
        filtered = filtered.filter(t => t.date && t.date.startsWith(selectedMonth));
    } else if (currentView === 'yearly') {
        // Use selected year or current year
        const selectedYear = yearSelector || year.toString();
        console.log('📆 Filtering for year:', selectedYear);
        filtered = filtered.filter(t => t.date && t.date.startsWith(selectedYear));
    } else if (currentView === 'custom') {
        // Use custom date range
        if (customStartDate && customEndDate) {
            console.log('📅 Filtering for custom range:', customStartDate, 'to', customEndDate);
            filtered = filtered.filter(t => {
                if (!t.date) return false;
                return t.date >= customStartDate && t.date <= customEndDate;
            });
        } else {
            console.log('⚠️ Custom range not set, showing all transactions');
        }
    } else if (currentView === 'all') {
        // Show all transactions without any date filtering
        console.log('📋 Showing all transactions (no date filter)');
        // filtered already contains all transactions, no additional filtering needed
    }
    
    console.log('✅ Final filtered transactions:', filtered.length);
    return filtered;
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
            if (icon) icon.className = 'fas fa-check';
            syncIndicator.innerHTML = '<i class="fas fa-check"></i> Synced';
            break;
        case 'error':
            if (icon) icon.className = 'fas fa-exclamation-triangle';
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

// Authentication Modal Functions
function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        
        // Check if first-time visitor - show signup instead of signin
        const hasVisitedBefore = localStorage.getItem('hasVisitedBefore');
        if (!hasVisitedBefore) {
            switchAuthTab('signup');
            localStorage.setItem('hasVisitedBefore', 'true');
        } else {
            switchAuthTab('signin');
        }
        
        // Focus on first input
        const firstInput = modal.querySelector('input:not([style*="display: none"])');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
        // Reset forms
        const signInForm = document.getElementById('signInForm');
        const signUpForm = document.getElementById('signUpForm');
        if (signInForm) signInForm.reset();
        if (signUpForm) signUpForm.reset();
        
        // Reset to sign in tab
        switchAuthTab('signin');
    }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('authModal');
    if (modal && e.target === modal) {
        closeAuthModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modal = document.getElementById('authModal');
        if (modal && modal.style.display === 'flex') {
            closeAuthModal();
        }
    }
});

function switchAuthTab(tab) {
    const signInForm = document.getElementById('signInForm');
    const signUpForm = document.getElementById('signUpForm');
    const tabs = document.querySelectorAll('.auth-tab');
    const title = document.getElementById('authModalTitle');
    
    if (!signInForm || !signUpForm || !title) return;
    
    // Update tabs
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'signin') {
        const signinTab = document.querySelector('[onclick="switchAuthTab(\'signin\')"]');
        if (signinTab) signinTab.classList.add('active');
        signInForm.style.display = 'flex';
        signUpForm.style.display = 'none';
        title.textContent = 'Sign In to Database';
    } else {
        const signupTab = document.querySelector('[onclick="switchAuthTab(\'signup\')"]');
        if (signupTab) signupTab.classList.add('active');
        signInForm.style.display = 'none';
        signUpForm.style.display = 'flex';
        title.textContent = 'Create Database Account';
    }
}

// Smart Insights Generator
function updateInsights() {
    const insightsOverlay = document.getElementById('chartInsightsOverlay');
    if (!insightsOverlay) return;
    
    const insights = [];
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Get current month data
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const currentMonthTransactions = transactions.filter(t => t.date && t.date.startsWith(currentMonthStr));
    const currentMonthExpense = currentMonthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const currentMonthIncome = currentMonthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    
    // Get last month data
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const lastMonthStr = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}`;
    const lastMonthTransactions = transactions.filter(t => t.date && t.date.startsWith(lastMonthStr));
    const lastMonthExpense = lastMonthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const lastMonthIncome = lastMonthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    
    // Get last 3 months data for trend analysis
    const last3MonthsExpenses = [];
    const last3MonthsIncomes = [];
    for (let i = 1; i <= 3; i++) {
        const m = currentMonth - i;
        const y = m < 0 ? currentYear - 1 : currentYear;
        const month = m < 0 ? 12 + m : m;
        const monthStr = `${y}-${String(month + 1).padStart(2, '0')}`;
        const monthTx = transactions.filter(t => t.date && t.date.startsWith(monthStr));
        last3MonthsExpenses.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        last3MonthsIncomes.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
    }
    const avg3MonthExpense = last3MonthsExpenses.reduce((a, b) => a + b, 0) / 3;
    const avg3MonthIncome = last3MonthsIncomes.reduce((a, b) => a + b, 0) / 3;
    
    // Insight 1: Expense comparison with last month
    if (lastMonthExpense > 0) {
        const expenseChange = ((currentMonthExpense - lastMonthExpense) / lastMonthExpense * 100).toFixed(0);
        const expenseChangeAbs = Math.abs(expenseChange);
        if (currentMonthExpense > lastMonthExpense) {
            insights.push({
                type: 'negative',
                icon: 'fa-arrow-trend-up',
                text: `Spending up ${expenseChangeAbs}% this month`,
                detail: `You spent ₹${(currentMonthExpense - lastMonthExpense).toLocaleString('en-IN')} more than last month`,
                value: `₹${currentMonthExpense.toLocaleString('en-IN')}`
            });
        } else if (currentMonthExpense < lastMonthExpense) {
            insights.push({
                type: 'positive',
                icon: 'fa-arrow-trend-down',
                text: `Spending down ${expenseChangeAbs}% this month`,
                detail: `Great! You saved ₹${(lastMonthExpense - currentMonthExpense).toLocaleString('en-IN')} compared to last month`,
                value: `₹${currentMonthExpense.toLocaleString('en-IN')}`
            });
        }
    }
    
    // Insight 2: Income comparison
    if (lastMonthIncome > 0) {
        const incomeChange = ((currentMonthIncome - lastMonthIncome) / lastMonthIncome * 100).toFixed(0);
        const incomeChangeAbs = Math.abs(incomeChange);
        if (currentMonthIncome > lastMonthIncome) {
            insights.push({
                type: 'positive',
                icon: 'fa-coins',
                text: `Income up ${incomeChangeAbs}% this month`,
                detail: `You earned ₹${(currentMonthIncome - lastMonthIncome).toLocaleString('en-IN')} more than last month`,
                value: `₹${currentMonthIncome.toLocaleString('en-IN')}`
            });
        } else if (currentMonthIncome < lastMonthIncome) {
            insights.push({
                type: 'warning',
                icon: 'fa-chart-line',
                text: `Income down ${incomeChangeAbs}% this month`,
                detail: `You earned ₹${(lastMonthIncome - currentMonthIncome).toLocaleString('en-IN')} less than last month`,
                value: `₹${currentMonthIncome.toLocaleString('en-IN')}`
            });
        }
    }
    
    // Insight 3: Highest expense month in last 6 months
    const last6MonthsData = [];
    for (let i = 0; i < 6; i++) {
        const m = currentMonth - i;
        const y = m < 0 ? currentYear - 1 : currentYear;
        const month = m < 0 ? 12 + m : m;
        const monthStr = `${y}-${String(month + 1).padStart(2, '0')}`;
        const monthName = new Date(y, month).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const monthTx = transactions.filter(t => t.date && t.date.startsWith(monthStr));
        const expense = monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
        last6MonthsData.push({ monthStr, monthName, expense });
    }
    
    const maxExpenseMonth = last6MonthsData.reduce((max, curr) => curr.expense > max.expense ? curr : max, { expense: 0 });
    if (maxExpenseMonth.expense > 0 && maxExpenseMonth.monthStr === currentMonthStr) {
        insights.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            text: 'Highest spending month!',
            detail: 'This is your highest expense month in the last 6 months',
            value: `₹${maxExpenseMonth.expense.toLocaleString('en-IN')}`
        });
    } else if (maxExpenseMonth.expense > 0) {
        insights.push({
            type: 'neutral',
            icon: 'fa-calendar-check',
            text: `Highest spending was ${maxExpenseMonth.monthName}`,
            detail: `Peak spending month in the last 6 months`,
            value: `₹${maxExpenseMonth.expense.toLocaleString('en-IN')}`
        });
    }
    
    // Insight 4: Savings rate
    if (currentMonthIncome > 0) {
        const savingsRate = ((currentMonthIncome - currentMonthExpense) / currentMonthIncome * 100).toFixed(0);
        if (savingsRate > 30) {
            insights.push({
                type: 'positive',
                icon: 'fa-piggy-bank',
                text: `${savingsRate}% savings rate this month!`,
                detail: 'Excellent! You\'re saving more than 30% of your income',
                value: `₹${(currentMonthIncome - currentMonthExpense).toLocaleString('en-IN')}`
            });
        } else if (savingsRate > 0) {
            insights.push({
                type: 'neutral',
                icon: 'fa-piggy-bank',
                text: `${savingsRate}% savings rate this month`,
                detail: 'You\'re saving money, keep it up!',
                value: `₹${(currentMonthIncome - currentMonthExpense).toLocaleString('en-IN')}`
            });
        } else {
            insights.push({
                type: 'negative',
                icon: 'fa-wallet',
                text: 'Spending exceeds income!',
                detail: 'You\'re spending more than you earn this month',
                value: `-₹${Math.abs(currentMonthIncome - currentMonthExpense).toLocaleString('en-IN')}`
            });
        }
    }
    
    // Insight 5: Compare to 3-month average
    if (avg3MonthExpense > 0) {
        const expenseVsAvg = ((currentMonthExpense - avg3MonthExpense) / avg3MonthExpense * 100).toFixed(0);
        if (Math.abs(expenseVsAvg) > 20) {
            if (currentMonthExpense > avg3MonthExpense) {
                insights.push({
                    type: 'warning',
                    icon: 'fa-chart-bar',
                    text: `${Math.abs(expenseVsAvg)}% above 3-month average`,
                    detail: 'Your spending is higher than your usual pattern',
                    value: `Avg: ₹${avg3MonthExpense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                });
            } else {
                insights.push({
                    type: 'positive',
                    icon: 'fa-chart-bar',
                    text: `${Math.abs(expenseVsAvg)}% below 3-month average`,
                    detail: 'Great job keeping expenses under control!',
                    value: `Avg: ₹${avg3MonthExpense.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                });
            }
        }
    }
    
    // If no insights, show a default message
    if (insights.length === 0) {
        insights.push({
            type: 'neutral',
            icon: 'fa-lightbulb',
            text: 'Add more transactions to see insights',
            detail: 'Track your income and expenses to get personalized insights',
            value: ''
        });
    }
    
    // Render single line insight
    if (insights.length > 0) {
        const topInsight = insights[0];
        insightsOverlay.innerHTML = `
            <i class="fas ${topInsight.icon} insight-icon"></i>
            <span class="insight-text">${topInsight.text} ${topInsight.value ? '- ' + topInsight.value : ''}</span>
        `;
    } else {
        insightsOverlay.innerHTML = `
            <i class="fas fa-lightbulb insight-icon"></i>
            <span class="insight-text">Add transactions to see smart insights</span>
        `;
    }
}

// Initialize Chart Legend Toggles
function initializeChartLegendToggles() {
    const incomeToggle = document.querySelector('.legend-item.income');
    const expenseToggle = document.querySelector('.legend-item.expense');
    
    if (!incomeToggle || !expenseToggle) {
        console.log('Chart legend elements not found, skipping toggle initialization');
        return;
    }
    
    // Set initial active states
    updateLegendStates();
    
    // Add click event listeners
    incomeToggle.addEventListener('click', () => toggleChartData('income'));
    expenseToggle.addEventListener('click', () => toggleChartData('expense'));
    
    console.log('✅ Chart legend toggles initialized');
}

// Toggle chart data visibility
function toggleChartData(dataType) {
    const currentState = chartDataVisibility[dataType];
    
    // Prevent hiding both datasets
    if (currentState && chartDataVisibility.income && chartDataVisibility.expense) {
        // If both are visible and user clicks one, hide the other
        chartDataVisibility.income = dataType === 'income';
        chartDataVisibility.expense = dataType === 'expense';
    } else if (!currentState) {
        // If this dataset is hidden, show it
        chartDataVisibility[dataType] = true;
    } else {
        // If only this dataset is visible, show both
        chartDataVisibility.income = true;
        chartDataVisibility.expense = true;
    }
    
    // Update legend visual states
    updateLegendStates();
    
    // Update chart with filtered data
    updateComparisonChart();
    
    // Show feedback toast
    const visibleDatasets = [];
    if (chartDataVisibility.income) visibleDatasets.push('Income');
    if (chartDataVisibility.expense) visibleDatasets.push('Expense');
    
    showToast(`Showing: ${visibleDatasets.join(' & ')}`, 'info');
}

// Update legend visual states
function updateLegendStates() {
    const incomeToggle = document.querySelector('.legend-item.income');
    const expenseToggle = document.querySelector('.legend-item.expense');
    
    if (!incomeToggle || !expenseToggle) return;
    
    // Update income toggle
    if (chartDataVisibility.income) {
        incomeToggle.classList.add('active');
        incomeToggle.classList.remove('inactive');
    } else {
        incomeToggle.classList.remove('active');
        incomeToggle.classList.add('inactive');
    }
    
    // Update expense toggle
    if (chartDataVisibility.expense) {
        expenseToggle.classList.add('active');
        expenseToggle.classList.remove('inactive');
    } else {
        expenseToggle.classList.remove('active');
        expenseToggle.classList.add('inactive');
    }
}

// 3D Bar Chart for Income vs Expense Comparison with Smart Comparisons
function updateComparisonChart() {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;
    
    // Destroy existing chart
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const chartTitleElement = document.getElementById('chartTitle');
    const comparisonSummary = document.getElementById('chartComparisonSummary');
    
    let labels = [];
    let incomeData = [];
    let expenseData = [];
    let comparisonBadges = [];
    
    const today = new Date();
    
    // Handle precise period-based data visualization
    const currentPeriodButton = document.querySelector('.quick-period-btn.active, .all-transactions-btn.active');
    let periodDays = 7; // Default for daily view
    
    if (currentPeriodButton) {
        const daysAttr = currentPeriodButton.getAttribute('data-days');
        if (daysAttr) {
            periodDays = parseInt(daysAttr);
        } else if (currentPeriodButton.getAttribute('data-period') === 'today') {
            periodDays = 1;
        } else if (currentPeriodButton.getAttribute('data-period') === 'all') {
            periodDays = null; // All time
        }
    }
    
    if (currentView === 'daily' || periodDays !== null) {
        // Show exact period based on selected filter
        const daysToShow = periodDays || 7;
        
        for (let i = daysToShow - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            
            // Smart labeling based on period length
            let labelText;
            if (daysToShow === 1) {
                labelText = 'Today';
            } else if (daysToShow <= 7) {
                labelText = date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
            } else if (daysToShow <= 31) {
                labelText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } else {
                labelText = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
            
            labels.push(labelText);
            
            const dayTransactions = transactions.filter(t => t.date === dateStr);
            incomeData.push(dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + parseFloat(t.amount) || 0, 0));
            expenseData.push(dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount) || 0, 0));
        }
        
        // Smart title based on period
        if (chartTitleElement) {
            if (daysToShow === 1) {
                chartTitleElement.textContent = 'Today\'s Activity';
            } else if (daysToShow === 7) {
                chartTitleElement.textContent = 'Last 7 Days Daily Breakdown';
            } else if (daysToShow === 30) {
                chartTitleElement.textContent = 'Last 30 Days Daily Analysis';
            } else if (daysToShow === 90) {
                chartTitleElement.textContent = 'Last 3 Months Overview';
            } else if (daysToShow === 180) {
                chartTitleElement.textContent = 'Last 6 Months Analysis';
            } else if (daysToShow === 365) {
                chartTitleElement.textContent = 'Last Year Overview';
            } else {
                chartTitleElement.textContent = `Last ${daysToShow} Days Analysis`;
            }
        }
        
        // Calculate period-specific comparisons
        const currentPeriodExpense = expenseData.reduce((a, b) => a + b, 0);
        const currentPeriodIncome = incomeData.reduce((a, b) => a + b, 0);
        
        // Calculate comparison period data
        let comparisonExpense = 0;
        let comparisonIncome = 0;
        const comparisonStart = daysToShow;
        const comparisonEnd = daysToShow * 2 - 1;
        
        for (let i = comparisonStart; i <= comparisonEnd; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const dayTx = transactions.filter(t => t.date === dateStr);
            comparisonExpense += dayTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
            comparisonIncome += dayTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        }
        
        // Smart period comparisons
        if (comparisonExpense > 0) {
            const expChange = ((currentPeriodExpense - comparisonExpense) / comparisonExpense * 100).toFixed(0);
            const periodName = daysToShow === 1 ? 'yesterday' : 
                              daysToShow === 7 ? 'previous week' :
                              daysToShow === 30 ? 'previous month' :
                              daysToShow === 90 ? 'previous 3 months' :
                              `previous ${daysToShow} days`;
            
            comparisonBadges.push({
                type: currentPeriodExpense > comparisonExpense ? 'up' : 'down',
                icon: currentPeriodExpense > comparisonExpense ? 'fa-arrow-up' : 'fa-arrow-down',
                text: `${Math.abs(expChange)}% ${currentPeriodExpense > comparisonExpense ? 'more' : 'less'} expenses vs ${periodName}`
            });
        }
        
        if (comparisonIncome > 0) {
            const incChange = ((currentPeriodIncome - comparisonIncome) / comparisonIncome * 100).toFixed(0);
            const periodName = daysToShow === 1 ? 'yesterday' : 
                              daysToShow === 7 ? 'previous week' :
                              daysToShow === 30 ? 'previous month' :
                              daysToShow === 90 ? 'previous 3 months' :
                              `previous ${daysToShow} days`;
            
            comparisonBadges.push({
                type: currentPeriodIncome > comparisonIncome ? 'down' : 'up',
                icon: currentPeriodIncome > comparisonIncome ? 'fa-arrow-up' : 'fa-arrow-down',
                text: `${Math.abs(incChange)}% ${currentPeriodIncome > comparisonIncome ? 'more' : 'less'} income vs ${periodName}`
            });
        }
        
        // Find peak activity day/period
        const maxExpenseIdx = expenseData.indexOf(Math.max(...expenseData));
        if (expenseData[maxExpenseIdx] > 0) {
            comparisonBadges.push({
                type: 'highlight',
                icon: 'fa-fire',
                text: `${labels[maxExpenseIdx]} was your peak spending period (₹${expenseData[maxExpenseIdx].toLocaleString('en-IN')})`
            });
        }
        
        // Daily average insights
        if (daysToShow > 1) {
            const dailyAvgExpense = currentPeriodExpense / daysToShow;
            if (dailyAvgExpense > 0) {
                comparisonBadges.push({
                    type: 'neutral',
                    icon: 'fa-calculator',
                    text: `Daily average expense: ₹${Math.round(dailyAvgExpense).toLocaleString('en-IN')}`
                });
            }
        }
        
    } else if (currentView === 'monthly') {
        // Show last 6 months comparison
        for (let i = 5; i >= 0; i--) {
            const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const monthName = date.toLocaleDateString('en-US', { month: 'short' });
            labels.push(monthName);
            
            const monthTransactions = transactions.filter(t => t.date && t.date.startsWith(monthStr));
            incomeData.push(monthTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + parseFloat(t.amount) || 0, 0));
            expenseData.push(monthTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + parseFloat(t.amount) || 0, 0));
        }
        
        // Find highest expense month
        const maxExpenseVal = Math.max(...expenseData);
        const maxExpenseIdx = expenseData.indexOf(maxExpenseVal);
        if (maxExpenseVal > 0) {
            comparisonBadges.push({
                type: maxExpenseIdx === 5 ? 'up' : 'highlight',
                icon: 'fa-chart-line',
                text: maxExpenseIdx === 5 ? 'This month has highest expenses!' : `${labels[maxExpenseIdx]} had highest expenses (₹${maxExpenseVal.toLocaleString('en-IN')})`
            });
        }
        
        // Find highest income month
        const maxIncomeVal = Math.max(...incomeData);
        const maxIncomeIdx = incomeData.indexOf(maxIncomeVal);
        if (maxIncomeVal > 0) {
            comparisonBadges.push({
                type: maxIncomeIdx === 5 ? 'down' : 'neutral',
                icon: 'fa-trophy',
                text: maxIncomeIdx === 5 ? 'This month has highest income!' : `${labels[maxIncomeIdx]} had highest income (₹${maxIncomeVal.toLocaleString('en-IN')})`
            });
        }
        
        // Compare last 3 months trend
        const last3Expenses = expenseData.slice(-3);
        if (last3Expenses[2] > last3Expenses[1] && last3Expenses[1] > last3Expenses[0]) {
            comparisonBadges.push({
                type: 'up',
                icon: 'fa-exclamation-triangle',
                text: 'Expenses increasing for 3 months straight!'
            });
        } else if (last3Expenses[2] < last3Expenses[1] && last3Expenses[1] < last3Expenses[0]) {
            comparisonBadges.push({
                type: 'down',
                icon: 'fa-thumbs-up',
                text: 'Great! Expenses decreasing for 3 months!'
            });
        }
        
        if (chartTitleElement) chartTitleElement.textContent = 'Last 6 Months Comparison';
        
    } else if (currentView === 'yearly') {
        // Show last 5 years comparison
        const currentYear = today.getFullYear();
        for (let i = 4; i >= 0; i--) {
            const year = currentYear - i;
            labels.push(year.toString());
            
            const yearTransactions = transactions.filter(t => t.date && t.date.startsWith(year.toString()));
            incomeData.push(yearTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
            expenseData.push(yearTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
        }
        
        // Find best year (highest savings)
        const savings = incomeData.map((inc, i) => inc - expenseData[i]);
        const bestYearIdx = savings.indexOf(Math.max(...savings));
        if (savings[bestYearIdx] > 0) {
            comparisonBadges.push({
                type: 'neutral',
                icon: 'fa-star',
                text: `${labels[bestYearIdx]} was your best savings year (₹${savings[bestYearIdx].toLocaleString('en-IN')})`
            });
        }
        
        // Compare this year with last year
        if (expenseData[4] > 0 && expenseData[3] > 0) {
            const yearChange = ((expenseData[4] - expenseData[3]) / expenseData[3] * 100).toFixed(0);
            comparisonBadges.push({
                type: expenseData[4] > expenseData[3] ? 'up' : 'down',
                icon: expenseData[4] > expenseData[3] ? 'fa-arrow-up' : 'fa-arrow-down',
                text: `${Math.abs(yearChange)}% ${expenseData[4] > expenseData[3] ? 'more' : 'less'} expenses than last year`
            });
        }
        
        if (chartTitleElement) chartTitleElement.textContent = 'Last 5 Years Comparison';
        
    } else if (currentView === 'all' || (currentView === 'custom' && !customStartDate && !customEndDate)) {
        // Show all-time monthly summary for 'all' view
        const monthlyData = {};
        
        // Group transactions by month
        transactions.forEach(t => {
            if (t.date) {
                const monthKey = t.date.substring(0, 7); // YYYY-MM
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { income: 0, expense: 0 };
                }
                monthlyData[monthKey][t.type] += parseFloat(t.amount) || 0;
            }
        });
        
        // Get last 6 months or all available months (whichever is less)
        const sortedMonths = Object.keys(monthlyData).sort();
        const lastMonths = sortedMonths.slice(-6); // Show last 6 months of data
        
        lastMonths.forEach(monthKey => {
            const date = new Date(monthKey + '-01');
            const monthName = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            labels.push(monthName);
            incomeData.push(monthlyData[monthKey].income);
            expenseData.push(monthlyData[monthKey].expense);
        });
        
        // Calculate total insights
        const totalIncome = incomeData.reduce((a, b) => a + b, 0);
        const totalExpense = expenseData.reduce((a, b) => a + b, 0);
        const totalSavings = totalIncome - totalExpense;
        
        if (totalSavings > 0) {
            comparisonBadges.push({
                type: 'down',
                icon: 'fa-piggy-bank',
                text: `Total savings: ₹${totalSavings.toLocaleString('en-IN')}`
            });
        }
        
        // Find best month
        const savings = incomeData.map((inc, i) => inc - expenseData[i]);
        const bestMonthIdx = savings.indexOf(Math.max(...savings));
        if (savings[bestMonthIdx] > 0) {
            comparisonBadges.push({
                type: 'neutral',
                icon: 'fa-trophy',
                text: `${labels[bestMonthIdx]} was your best month (₹${savings[bestMonthIdx].toLocaleString('en-IN')} saved)`
            });
        }
        
        // Average monthly expense - fix calculation to count only actual data months
        const monthsWithData = expenseData.filter(amount => amount > 0).length;
        const avgExpense = monthsWithData > 0 ? totalExpense / monthsWithData : 0;
        if (avgExpense > 0) {
            comparisonBadges.push({
                type: 'highlight',
                icon: 'fa-calculator',
                text: `Average monthly expense: ₹${Math.round(avgExpense).toLocaleString('en-IN')} (${monthsWithData} months)`
            });
        }
        
        if (chartTitleElement) chartTitleElement.textContent = 'All-Time Summary (Last 6 Months)';
        
    } else if (currentView === 'custom' && customStartDate && customEndDate) {
        // Handle custom date ranges
        const startDate = new Date(customStartDate + 'T00:00:00');
        const endDate = new Date(customEndDate + 'T00:00:00');
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        
        if (daysDiff <= 7) {
            // Show daily data for short ranges
            for (let i = 0; i < daysDiff; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                labels.push(dayName);
                
                const dayTransactions = transactions.filter(t => t.date === dateStr);
                incomeData.push(dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                expenseData.push(dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            }
            if (chartTitleElement) chartTitleElement.textContent = 'Custom Range (Daily)';
        } else {
            // Group by month for longer ranges
            const monthlyData = {};
            transactions.forEach(t => {
                if (t.date && t.date >= customStartDate && t.date <= customEndDate) {
                    const monthKey = t.date.substring(0, 7);
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = { income: 0, expense: 0 };
                    }
                    monthlyData[monthKey][t.type] += parseFloat(t.amount) || 0;
                }
            });
            
            Object.keys(monthlyData).sort().forEach(monthKey => {
                const date = new Date(monthKey + '-01');
                const monthName = date.toLocaleDateString('en-US', { month: 'short' });
                labels.push(monthName);
                incomeData.push(monthlyData[monthKey].income);
                expenseData.push(monthlyData[monthKey].expense);
            });
            if (chartTitleElement) chartTitleElement.textContent = 'Custom Range (Monthly)';
        }
        
        // Add custom range insights
        const totalIncome = incomeData.reduce((a, b) => a + b, 0);
        const totalExpense = expenseData.reduce((a, b) => a + b, 0);
        
        if (totalIncome > totalExpense) {
            comparisonBadges.push({
                type: 'down',
                icon: 'fa-thumbs-up',
                text: `You saved ₹${(totalIncome - totalExpense).toLocaleString('en-IN')} in this period!`
            });
        }
    } else if (currentView === 'custom' && customStartDate && customEndDate) {
        // Show custom range - group by appropriate interval
        const startDate = new Date(customStartDate + 'T00:00:00');
        const endDate = new Date(customEndDate + 'T00:00:00');
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 14) {
            // Show daily for ranges up to 2 weeks
            for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const dayName = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                labels.push(dayName);
                
                const dayTransactions = transactions.filter(t => t.date === dateStr);
                incomeData.push(dayTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                expenseData.push(dayTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            }
        } else if (daysDiff <= 90) {
            // Show weekly for ranges up to 3 months
            let weekStart = new Date(startDate);
            while (weekStart <= endDate) {
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());
                
                const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                labels.push(weekLabel);
                
                let weekIncome = 0;
                let weekExpense = 0;
                for (let d = new Date(weekStart); d <= weekEnd; d.setDate(d.getDate() + 1)) {
                    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const dayTx = transactions.filter(t => t.date === dateStr);
                    weekIncome += dayTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                    weekExpense += dayTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                }
                incomeData.push(weekIncome);
                expenseData.push(weekExpense);
                
                weekStart.setDate(weekStart.getDate() + 7);
            }
        } else {
            // Show monthly for longer ranges
            const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
            
            for (let d = new Date(startMonth); d <= endMonth; d.setMonth(d.getMonth() + 1)) {
                const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const monthName = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                labels.push(monthName);
                
                const monthTx = transactions.filter(t => t.date && t.date.startsWith(monthStr) && t.date >= customStartDate && t.date <= customEndDate);
                incomeData.push(monthTx.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
                expenseData.push(monthTx.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0));
            }
        }
        
        // Custom range insights
        const totalRangeExpense = expenseData.reduce((a, b) => a + b, 0);
        const totalRangeIncome = incomeData.reduce((a, b) => a + b, 0);
        const netSavings = totalRangeIncome - totalRangeExpense;
        
        comparisonBadges.push({
            type: 'neutral',
            icon: 'fa-calendar-check',
            text: `${daysDiff} days selected`
        });
        
        if (netSavings > 0) {
            comparisonBadges.push({
                type: 'down',
                icon: 'fa-piggy-bank',
                text: `Net savings: ₹${netSavings.toLocaleString('en-IN')}`
            });
        } else if (netSavings < 0) {
            comparisonBadges.push({
                type: 'up',
                icon: 'fa-exclamation-circle',
                text: `Net spending: ₹${Math.abs(netSavings).toLocaleString('en-IN')}`
            });
        }
        
        // Find highest expense period
        if (expenseData.length > 0) {
            const maxExpenseVal = Math.max(...expenseData);
            const maxExpenseIdx = expenseData.indexOf(maxExpenseVal);
            if (maxExpenseVal > 0) {
                comparisonBadges.push({
                    type: 'highlight',
                    icon: 'fa-fire',
                    text: `Peak spending: ${labels[maxExpenseIdx]} (₹${maxExpenseVal.toLocaleString('en-IN')})`
                });
            }
        }
        
        if (chartTitleElement) chartTitleElement.textContent = 'Custom Range Analysis';
    }
    
    // Render comparison badges
    if (comparisonSummary) {
        comparisonSummary.innerHTML = comparisonBadges.slice(0, 3).map(badge => `
            <span class="comparison-badge ${badge.type}">
                <i class="fas ${badge.icon}"></i>
                ${badge.text}
            </span>
        `).join('');
    }
    
    // Create 3D effect with enhanced gradients
    const context = ctx.getContext('2d');
    const incomeGradient = context.createLinearGradient(0, 0, 0, 350);
    incomeGradient.addColorStop(0, 'rgba(34, 197, 94, 1)');
    incomeGradient.addColorStop(0.4, 'rgba(34, 197, 94, 0.85)');
    incomeGradient.addColorStop(1, 'rgba(22, 163, 74, 0.5)');
    
    const expenseGradient = context.createLinearGradient(0, 0, 0, 350);
    expenseGradient.addColorStop(0, 'rgba(239, 68, 68, 1)');
    expenseGradient.addColorStop(0.4, 'rgba(239, 68, 68, 0.85)');
    expenseGradient.addColorStop(1, 'rgba(220, 38, 38, 0.5)');
    
    // Create datasets based on visibility settings
    const datasets = [];
    
    if (chartDataVisibility.income) {
        datasets.push({
            label: 'Income',
            data: incomeData,
            backgroundColor: incomeGradient,
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 2,
            borderRadius: { topLeft: 8, topRight: 8 },
            borderSkipped: false,
            hoverBackgroundColor: 'rgba(34, 197, 94, 0.95)',
            hoverBorderWidth: 3
        });
    }
    
    if (chartDataVisibility.expense) {
        datasets.push({
            label: 'Expense',
            data: expenseData,
            backgroundColor: expenseGradient,
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 2,
            borderRadius: { topLeft: 8, topRight: 8 },
            borderSkipped: false,
            hoverBackgroundColor: 'rgba(239, 68, 68, 0.95)',
            hoverBorderWidth: 3
        });
    }

    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    padding: 14,
                    cornerRadius: 10,
                    displayColors: true,
                    boxPadding: 6,
                    callbacks: {
                        title: function(context) {
                            return context[0].label;
                        },
                        label: function(context) {
                            const value = context.raw;
                            return `${context.dataset.label}: ₹${value.toLocaleString('en-IN')}`;
                        },
                        afterBody: function(context) {
                            // Handle dynamic datasets for balance calculation
                            let income = 0;
                            let expense = 0;
                            
                            context.forEach(item => {
                                if (item.dataset.label === 'Income') {
                                    income = item.raw || 0;
                                } else if (item.dataset.label === 'Expense') {
                                    expense = item.raw || 0;
                                }
                            });
                            
                            // If only one dataset is visible, get the other from original data
                            if (!chartDataVisibility.income && context.length === 1) {
                                const dataIndex = context[0].dataIndex;
                                income = incomeData[dataIndex] || 0;
                            } else if (!chartDataVisibility.expense && context.length === 1) {
                                const dataIndex = context[0].dataIndex;
                                expense = expenseData[dataIndex] || 0;
                            }
                            
                            const balance = income - expense;
                            return [`\nBalance: ₹${balance.toLocaleString('en-IN')}`];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { size: 12, weight: '600' },
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#718096'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.06)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 11, weight: '500' },
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#718096',
                        callback: function(value) {
                            if (value >= 10000000) return '₹' + (value / 10000000).toFixed(1) + 'Cr';
                            if (value >= 100000) return '₹' + (value / 100000).toFixed(1) + 'L';
                            if (value >= 1000) return '₹' + (value / 1000).toFixed(0) + 'K';
                            return '₹' + value;
                        }
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart',
                delay: function(context) {
                    return context.dataIndex * 100;
                }
            },
            barPercentage: 0.75,
            categoryPercentage: 0.85
        }
    });
    
    // Update insights when chart updates
    updateInsights();
}

// Mobile optimization functions
function initializeMobileOptimizations() {
    // Prevent zoom on input focus for iOS
    if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="number"]');
        inputs.forEach(input => {
            input.addEventListener('focus', function() {
                this.style.fontSize = '16px';
            });
            input.addEventListener('blur', function() {
                this.style.fontSize = '';
            });
        });
    }
    
    // Add touch-friendly classes
    document.body.classList.add('touch-optimized');
    
    // Enhanced scroll performance for transaction list
    const transactionsList = document.querySelector('.transactions-scroll-container');
    if (transactionsList) {
        transactionsList.style.webkitOverflowScrolling = 'touch';
        transactionsList.style.overflowScrolling = 'touch';
    }
    
    // Add pull-to-refresh hint for mobile
    if ('ontouchstart' in window) {
        addPullToRefreshHint();
    }
    
    // Optimize chart rendering for mobile
    optimizeChartsForMobile();
    
    // Add swipe gestures for navigation
    addSwipeGestures();
}

function addPullToRefreshHint() {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        let startY = 0;
        let currentY = 0;
        
        mainContent.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        }, { passive: true });
        
        mainContent.addEventListener('touchmove', (e) => {
            currentY = e.touches[0].clientY;
            if (currentY - startY > 100 && window.scrollY === 0) {
                // Show pull to refresh hint
                if (!document.querySelector('.pull-refresh-hint')) {
                    const hint = document.createElement('div');
                    hint.className = 'pull-refresh-hint';
                    hint.innerHTML = '<i class="fas fa-sync-alt"></i> Release to refresh';
                    hint.style.cssText = `
                        position: fixed;
                        top: 20px;
                        left: 50%;
                        transform: translateX(-50%);
                        background: var(--primary-color);
                        color: white;
                        padding: 0.5rem 1rem;
                        border-radius: 20px;
                        font-size: 0.8rem;
                        z-index: 1000;
                        animation: slideDown 0.3s ease;
                    `;
                    document.body.appendChild(hint);
                }
            }
        }, { passive: true });
        
        mainContent.addEventListener('touchend', () => {
            const hint = document.querySelector('.pull-refresh-hint');
            if (hint && currentY - startY > 100 && window.scrollY === 0) {
                // Trigger refresh
                updateUI();
                hint.remove();
                showToast('Data refreshed!', 'success');
            } else if (hint) {
                hint.remove();
            }
        }, { passive: true });
    }
}

function optimizeChartsForMobile() {
    // Add responsive chart options
    const isMobile = window.innerWidth <= 768;
    
    if (window.expenseChart) {
        window.expenseChart.options.responsive = true;
        window.expenseChart.options.maintainAspectRatio = false;
        
        if (isMobile) {
            window.expenseChart.options.plugins.legend.display = false;
            window.expenseChart.options.scales.x.ticks.maxTicksLimit = 5;
            window.expenseChart.options.scales.y.ticks.maxTicksLimit = 5;
        }
        
        window.expenseChart.update();
    }
}

function addSwipeGestures() {
    const categoryTabs = document.querySelector('.category-tabs');
    if (!categoryTabs || !('ontouchstart' in window)) return;
    
    let startX = 0;
    let startY = 0;
    let isSwipeGesture = false;
    
    categoryTabs.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwipeGesture = true;
    }, { passive: true });
    
    categoryTabs.addEventListener('touchmove', (e) => {
        if (!isSwipeGesture) return;
        
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const diffX = Math.abs(currentX - startX);
        const diffY = Math.abs(currentY - startY);
        
        // If vertical scroll is detected, disable swipe
        if (diffY > diffX) {
            isSwipeGesture = false;
        }
    }, { passive: true });
    
    categoryTabs.addEventListener('touchend', (e) => {
        if (!isSwipeGesture) return;
        
        const endX = e.changedTouches[0].clientX;
        const diffX = startX - endX;
        
        if (Math.abs(diffX) > 50) { // Minimum swipe distance
            if (diffX > 0) {
                // Swipe left - next category
                switchToNextCategory();
            } else {
                // Swipe right - previous category  
                switchToPreviousCategory();
            }
        }
        
        isSwipeGesture = false;
    }, { passive: true });
}

function switchToNextCategory() {
    const categoryKeys = Object.keys(categories);
    const currentIndex = categoryKeys.indexOf(activeCategory);
    const nextIndex = (currentIndex + 1) % categoryKeys.length;
    const nextCategory = categoryKeys[nextIndex];
    
    if (nextCategory && nextCategory !== activeCategory) {
        switchCategory(nextCategory);
    }
}

function switchToPreviousCategory() {
    const categoryKeys = Object.keys(categories);
    const currentIndex = categoryKeys.indexOf(activeCategory);
    const prevIndex = currentIndex === 0 ? categoryKeys.length - 1 : currentIndex - 1;
    const prevCategory = categoryKeys[prevIndex];
    
    if (prevCategory && prevCategory !== activeCategory) {
        switchCategory(prevCategory);
    }
}

// Window resize handler for responsive updates
window.addEventListener('resize', debounce(() => {
    optimizeChartsForMobile();
    updateUI();
}, 250));

// Debounce function for performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}