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
let transactions = [];
let currentView = 'daily';
let expenseChart = null;
let currentEditingId = null;
let currentUserId = null; // Add user ID tracking

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
                    showToast(`Welcome back, ${authData.email.split('@')[0]}!`, 'success');
                    
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
                    showToast(`Welcome back, ${session.user.email}!`, 'success');
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
    setupAuthModalListeners(); // Add authentication form listeners
    
    // Load transactions (from database if authenticated, localStorage if not)
    await loadTransactions();
    updateUI();
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
            
            showToast(`Welcome back, ${currentUser.email.split('@')[0]}!`, 'success');
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
        
        if (data.user && !data.session) {
            // Show email verification popup
            showEmailVerificationPopup(email);
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
        if (userEmail) userEmail.textContent = currentUser.email;
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
    
    // Filters
    const monthFilter = document.getElementById('monthFilter');
    if (monthFilter) {
        monthFilter.addEventListener('change', () => {
            console.log('🗓️ Month filter changed');
            applyFilters();
        });
    }
    
    const yearFilter = document.getElementById('yearFilter');
    if (yearFilter) {
        yearFilter.addEventListener('change', () => {
            console.log('📅 Year filter changed');
            applyFilters();
        });
    }
    
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', () => {
            console.log('🏷️ Category filter changed');
            applyFilters();
        });
    }
    
    const clearFiltersBtn = document.getElementById('clearFilters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', () => {
            console.log('🧹 Clear filters clicked');
            clearFilters();
        });
        console.log('✅ Clear filters button listener added');
    } else {
        console.warn('❌ Clear filters button not found');
    }
    
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
                
                if (error) throw error;
                
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
    const today = new Date().toISOString().split('T')[0];
    console.log('📅 Setting current date to:', today);
    
    const dateField = document.getElementById('date');
    if (dateField) {
        dateField.value = today;
        console.log('✅ Date field set to:', dateField.value);
    } else {
        console.error('❌ Date field not found');
    }
    
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (document.getElementById('monthFilter')) {
        document.getElementById('monthFilter').value = currentMonth;
        console.log('📅 Month filter set to:', currentMonth);
    }
    
    const currentYear = new Date().getFullYear();
    if (document.getElementById('yearFilter')) {
        document.getElementById('yearFilter').value = currentYear;
        console.log('📅 Year filter set to:', currentYear);
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
        const today = now.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        periodDisplay.textContent = "Today's Expenses";
        dateDetails.textContent = today;
    } else if (currentView === 'monthly') {
        const currentMonth = now.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long'
        });
        periodDisplay.textContent = "This Month's Expenses";
        dateDetails.textContent = currentMonth;
    } else if (currentView === 'yearly') {
        const currentYear = now.getFullYear();
        periodDisplay.textContent = "This Year's Expenses";
        dateDetails.textContent = `Year ${currentYear}`;
    }
    
    // Update transaction count
    updateTransactionCount();
}

// Update transaction count display
function updateTransactionCount() {
    const countElement = document.getElementById('transactionCount');
    if (!countElement) return;
    
    const filteredTransactions = getFilteredTransactions();
    const count = filteredTransactions.length;
    
    countElement.textContent = count === 1 ? '1 transaction' : `${count} transactions`;
}

// Transaction management
async function handleAddTransaction(e) {
    e.preventDefault();
    console.log('📝 Processing transaction form...');
    
    // Get form values directly from DOM elements
    const description = document.getElementById('description').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const category = document.getElementById('category').value;
    const type = document.getElementById('type').value;
    const dateInput = document.getElementById('date').value;
    
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
        
        // ALWAYS save to localStorage first as backup
        transactions.push(transaction);
        saveTransactions();
        console.log('💾 Emergency backup: Transaction saved to localStorage');
        
        // Update UI immediately with localStorage data
        updateUI();
        console.log('🔄 UI updated with localStorage backup');
        
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
            
            // Data automatically syncs to Supabase database when authenticated
        }
    }
}

function deleteTransaction(id) {
    if (confirm('Are you sure you want to delete this transaction?')) {
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        updateUI();
        showToast('Transaction deleted successfully!', 'success');
        
        // Data automatically syncs to Supabase database when authenticated
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
    console.log('🔄 Loading transactions...');
    if (currentUser && supabaseClient) {
        // Load from Supabase database using direct fetch (faster than client)
        try {
            console.log('📡 Loading from Supabase database for user:', currentUser.email);
            
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
    console.log('🔄 Updating UI with', transactions.length, 'total transactions');
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
    console.log('📊 Updating summary with transactions:', filteredTransactions.length);
    
    const totalIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const totalExpenses = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
    
    const balance = totalIncome - totalExpenses;
    
    console.log('💰 Summary calculations:', { totalIncome, totalExpenses, balance });
    
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
    console.log('🔍 Starting with', filtered.length, 'total transactions');
    
    // Apply date filters based on current view
    const now = new Date();
    const today = new Date().toISOString().split('T')[0];
    const monthFilter = document.getElementById('monthFilter')?.value;
    const yearFilter = document.getElementById('yearFilter')?.value;
    const categoryFilter = document.getElementById('categoryFilter')?.value;
    
    console.log('📅 Current view:', currentView);
    console.log('📅 Today date:', today);
    console.log('📅 Filters:', { monthFilter, yearFilter, categoryFilter });
    
    if (currentView === 'daily') {
        // Show today's transactions by default, or filtered date
        filtered = filtered.filter(t => {
            const transactionDate = t.date || '';
            if (!transactionDate) return false;
            if (monthFilter) {
                return transactionDate.startsWith(monthFilter);
            }
            return transactionDate === today;
        });
    } else if (currentView === 'monthly') {
        // Show current month by default, or filtered month
        const currentMonth = monthFilter || now.toISOString().slice(0, 7);
        filtered = filtered.filter(t => t.date && t.date.startsWith(currentMonth));
    } else if (currentView === 'yearly') {
        // Show current year by default, or filtered year
        const currentYear = yearFilter || now.getFullYear().toString();
        filtered = filtered.filter(t => t.date && t.date.startsWith(currentYear));
    }
    
    // Apply category filter
    if (categoryFilter) {
        filtered = filtered.filter(t => t.category === categoryFilter);
    }
    
    console.log('✅ Final filtered transactions:', filtered.length);
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

// Authentication Modal Functions
function openAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        // Focus on first input
        const firstInput = modal.querySelector('input');
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