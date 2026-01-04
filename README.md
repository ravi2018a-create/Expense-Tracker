# Expense Tracker Web Application

A comprehensive expenses tracking web application with daily, monthly, and yearly views, Google Drive integration for data backup, and modern UI/UX design.

## Features

### 📊 **Multiple View Options**
- **Daily View**: Track day-to-day expenses
- **Monthly View**: Monitor monthly spending patterns
- **Yearly View**: Analyze annual financial trends

### 🔐 **Google Drive Integration**
- User authentication with Google Sign-in
- Automatic data backup to Google Drive
- Cross-device data synchronization
- User-specific data storage

### 💫 **Modern UI/UX**
- Clean, responsive design
- Dark/Light theme toggle
- Smooth animations and transitions
- Mobile-friendly interface
- Interactive charts and visualizations

### 📈 **Analytics & Visualization**
- Real-time expense categorization
- Interactive pie charts with Chart.js
- Income vs. Expenses tracking
- Balance calculations
- Category-wise expense breakdown

### 🛠 **Advanced Features**
- Add, edit, and delete transactions
- Category-based filtering
- Date range filtering
- Local storage backup
- Toast notifications
- Form validation
- Export capabilities

## Setup Instructions

### Prerequisites
1. Web browser with JavaScript enabled
2. Google Cloud Platform account (for Google Drive API)
3. Local web server (optional, for development)

### Google Drive API Setup

1. **Create a Google Cloud Project:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the Google Drive API

2. **Create API Credentials:**
   - Go to "Credentials" in the Google Cloud Console
   - Click "Create Credentials" → "API Key"
   - Copy the API key

3. **Set up OAuth 2.0:**
   - In "Credentials", click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add your domain to "Authorized JavaScript origins"
   - Copy the Client ID

4. **Configure the Application:**
   - Open `script.js`
   - Replace `'YOUR_API_KEY'` with your Google API key
   - Replace `'YOUR_CLIENT_ID.googleusercontent.com'` with your OAuth Client ID

### Installation

1. **Clone or Download:**
   ```bash
   # Clone the repository (if using git)
   git clone [repository-url]
   cd expenses-tracker
   
   # Or simply download and extract the files
   ```

2. **Update Configuration:**
   ```javascript
   // In script.js, update these lines:
   await gapi.client.init({
       apiKey: 'YOUR_ACTUAL_API_KEY', // Replace with your API key
       discoveryDocs: [DISCOVERY_DOC],
   });
   
   google.accounts.id.initialize({
       client_id: 'YOUR_ACTUAL_CLIENT_ID.googleusercontent.com', // Replace with your Client ID
       callback: handleSignInWithGoogle,
   });
   ```

3. **Run the Application:**
   - **Option 1 - Simple File Access:**
     - Open `index.html` directly in your browser
     - Note: Google API features may be limited without HTTPS
   
   - **Option 2 - Local Server (Recommended):**
     ```bash
     # Using Python
     python -m http.server 8000
     # Or using Node.js
     npx http-server
     # Or using PHP
     php -S localhost:8000
     ```
     - Open `http://localhost:8000` in your browser

## Usage Guide

### Getting Started
1. **Open the Application** in your web browser
2. **Sign in with Google** to enable data backup (optional)
3. **Add your first transaction** using the form
4. **Switch between views** (Daily, Monthly, Yearly) using the navigation tabs

### Adding Transactions
1. Fill in the transaction form:
   - **Description**: What was the expense/income for
   - **Amount**: The monetary value
   - **Category**: Choose from predefined categories
   - **Type**: Income or Expense
   - **Date**: When the transaction occurred
2. Click "Add Transaction"

### Viewing Data
- **Daily View**: Shows transactions for the current day or filtered date
- **Monthly View**: Displays all transactions for the selected month
- **Yearly View**: Shows annual transaction summary

### Using Filters
- **Month Filter**: Select specific month to view
- **Year Filter**: Enter year to filter by
- **Category Filter**: Filter by expense category
- **Clear Filters**: Reset all filters

### Google Drive Features
- **Automatic Backup**: Data is automatically synced when signed in
- **Cross-Device Sync**: Access your data from any device
- **User Isolation**: Each user's data is stored separately

## File Structure

```
expenses-tracker/
│
├── index.html          # Main HTML file
├── styles.css          # CSS styles and themes
├── script.js           # JavaScript functionality
├── README.md           # This file
└── config.js           # Configuration file (optional)
```

## Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Charts**: Chart.js
- **Icons**: Font Awesome
- **Fonts**: Google Fonts (Inter)
- **APIs**: Google Drive API, Google Sign-in
- **Storage**: LocalStorage + Google Drive

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Responsive design

## Security Features

- Client-side data validation
- Secure Google OAuth authentication
- Local data encryption (browser storage)
- HTTPS recommended for production

## Customization

### Adding New Categories
```javascript
// In script.js, update the category options:
const categories = {
    newCategory: {
        name: 'New Category',
        icon: '🆕'
    }
};
```

### Changing Currency
```javascript
// Update the formatCurrency function:
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'EUR' // Change to your preferred currency
    }).format(amount);
}
```

### Theme Customization
Modify CSS variables in `styles.css`:
```css
:root {
    --primary-color: #your-color;
    --background-color: #your-bg;
    /* Add your custom colors */
}
```

## Troubleshooting

### Common Issues

1. **Google Sign-in not working:**
   - Check API credentials are correct
   - Ensure domain is added to authorized origins
   - Verify HTTPS is used (required for production)

2. **Data not syncing:**
   - Check internet connection
   - Verify Google Drive API is enabled
   - Check browser console for errors

3. **Charts not displaying:**
   - Ensure Chart.js is loading properly
   - Check browser console for JavaScript errors

### Development Tips

- Use browser developer tools to debug
- Check the console for error messages
- Test with different browsers
- Use HTTPS for Google API features

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review browser console for errors  
3. Verify Google API setup is correct

## Future Enhancements

- [ ] Export to CSV/PDF
- [ ] Recurring transactions
- [ ] Budget planning
- [ ] Multi-currency support
- [ ] Advanced analytics
- [ ] Receipt photo uploads
- [ ] Expense sharing with family members