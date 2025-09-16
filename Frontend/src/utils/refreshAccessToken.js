import axios from 'axios';

const refreshAccessToken = async () => {
    try {
        console.log('Attempting to refresh access token...');

        
        const response = await axios.get(
            `${import.meta.env.VITE_SERVER_BASE_URL}/auth/refresh-token`,
            { withCredentials: true } // Config goes directly as 2nd parameter
        );

        if (response.data?.success) {
            console.log('Access token refreshed successfully');
            return {
                success: true,
                user: response.data.data, // User data from refresh response
                shouldLogout: false
            };
        } else {
            console.log('Refresh token response not successful:', response.data);
            return {
                success: false,
                error: 'Refresh token invalid',
                shouldLogout: true
            };
        }

    } catch (error) {
        console.log('Refresh token error:', error);

        if (error.response?.status === 401 || error.response?.status === 403) {
            // Refresh token is expired or invalid
            console.log('Refresh token expired or invalid');
            return {
                success: false,
                error: 'Refresh token expired',
                shouldLogout: true
            };
        }

        // For network errors or server errors (5xx), don't logout immediately
        // User might have temporary connectivity issues
        return {
            success: false,
            error: error.message || 'Refresh failed due to network/server error',
            shouldLogout: false // Don't force logout on network errors
        };
    }
};

export default refreshAccessToken;