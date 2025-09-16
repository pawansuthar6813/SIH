import axios from 'axios';
import { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

// Authentication Provider Component
const AuthContextProvider = ({ children }) => {

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true)

    const navigate = useNavigate();

    // Function to login user
    const login = () => {
        setIsAuthenticated(true);
    };

    // Function to logout user
    const logout = async () => {
        setIsLoading(true);
        try {
            const response = await axios.post(`${import.meta.env.VITE_SERVER_BASE_URL}/auth/logout`, {}, {
                withCredentials: true
            })

            if (response.data.success) {
                setIsAuthenticated(false);
                navigate("/auth")
            }
        } catch (error) {
            console.log(error.response.data.errorName);
            console.log(error)
            if (error.response?.data?.status === 400 || error.response?.data?.status === 401) {
                // Access token expired, use your modular refresh function
                const refreshResult = await refreshAccessToken();

                if (refreshResult.success) {
                    // Token refreshed successfully, user is authenticated
                    setIsAuthenticated(true);
                } else {
                    // Refresh failed
                    setIsAuthenticated(false);

                    if (refreshResult.shouldLogout) {
                        // Navigate to login if refresh token expired
                        navigate('/auth');
                    }
                }
            } else {
                // Other error, user not authenticated
                setIsAuthenticated(false);
                console.log("internal server error")
            }
        } finally { setIsLoading(false) }
        
    };

    const values = {
        isAuthenticated,
        isLoading,
        login,
        logout,
        setIsAuthenticated,
        setIsLoading
    };

    return (
        <AuthContext.Provider value={values}>
            {children}
        </AuthContext.Provider>
    );
};


export const useAuth = () => {
    return useContext(AuthContext)
};

export default AuthContextProvider


