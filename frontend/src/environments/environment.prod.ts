export const environment = {
  production: true,
  apiUrl: '/api', // Assuming the API will be served from the same domain in production
  firebaseConfig: {
    // Your Firebase configuration details if needed
  },
  geminiApiKey: '' // Should be injected during deployment for security
};
