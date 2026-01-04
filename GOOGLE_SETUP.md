# Google Drive Setup Instructions

To enable Google Drive sync for your Expense Tracker, follow these steps:

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Name your project (e.g., "Expense Tracker")

## Step 2: Enable APIs

1. In the Cloud Console, go to "APIs & Services" > "Library"
2. Search for and enable:
   - **Google Drive API**
   - **Google Picker API** (optional, for file browsing)

## Step 3: Create Credentials

### API Key
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API key"
3. Copy the API key
4. (Recommended) Restrict the key to your domain/IP

### OAuth 2.0 Client ID
1. In "Credentials", click "Create Credentials" > "OAuth client ID"
2. Choose "Web application"
3. Add your domain to "Authorized JavaScript origins":
   - For local development: `http://localhost:8000`
   - For production: `https://yourdomain.com`
4. Copy the Client ID

## Step 4: Update Your Code

Open `script.js` and replace the placeholder values:

```javascript
// Find these lines around line 50-60:
await gapi.client.init({
    apiKey: 'YOUR_ACTUAL_API_KEY_HERE', // Replace with your API key
    discoveryDocs: [DISCOVERY_DOC],
    clientId: 'YOUR_ACTUAL_CLIENT_ID_HERE.googleusercontent.com', // Replace with your Client ID
    scope: SCOPES
});

// And this line around line 80:
google.accounts.id.initialize({
    client_id: 'YOUR_ACTUAL_CLIENT_ID_HERE.googleusercontent.com', // Replace with your Client ID
    callback: handleSignInWithGoogle,
    // ...
});
```

## Step 5: Test the Integration

1. Open your expense tracker in a web browser
2. Click "Sign in with Google"
3. Grant permissions when prompted
4. Your data should now sync with Google Drive

## Troubleshooting

### Common Issues:

1. **"Sign in with Google" button shows "Demo Mode"**
   - Check that Google API scripts are loading
   - Verify your API credentials are correct
   - Check browser console for errors

2. **"Invalid client" error**
   - Double-check your Client ID
   - Ensure your domain is added to authorized origins
   - Clear browser cache and try again

3. **Permission denied errors**
   - Verify Google Drive API is enabled
   - Check that API key has proper restrictions
   - Ensure user has granted necessary permissions

4. **HTTPS required errors**
   - Google APIs require HTTPS in production
   - Use `http://localhost` for local development
   - Deploy to HTTPS for production use

### Debug Tips:

- Open browser Developer Tools (F12)
- Check Console tab for error messages
- Look for network errors in Network tab
- Verify API calls are being made

## Security Notes

- Never commit API keys to public repositories
- Use environment variables or config files
- Restrict API keys to specific domains/IPs
- Regularly rotate credentials
- Review OAuth consent screen settings

## Demo Mode

If you don't want to set up Google Drive integration:
- The app works perfectly in "Demo Mode"
- All data is saved locally in browser storage
- Export/import features can be used for backup
- No external dependencies or API keys needed

Your data will be automatically backed up locally and you can always add Google Drive sync later!