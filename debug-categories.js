// Debug Categories - Add this to your browser console to check what's happening

console.log('=== DEBUG CATEGORIES ===');
console.log('Current categories:', categories);
console.log('Active category:', activeCategory);
console.log('Current user:', currentUser);
console.log('User ID:', currentUserId);

// Check localStorage
const key = `categories_${currentUserId}`;
const localCategories = localStorage.getItem(key);
console.log('Categories in localStorage:', localCategories ? JSON.parse(localCategories) : 'None');

// Check authentication
const authData = localStorage.getItem('expense-tracker-auth');
console.log('Auth data:', authData ? JSON.parse(authData) : 'None');

// Force save categories to see what happens
console.log('Forcing save categories...');
saveCategories().then(() => {
    console.log('Save complete - check network tab for API calls');
}).catch(error => {
    console.error('Save failed:', error);
});