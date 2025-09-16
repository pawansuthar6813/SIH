import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useFarmer } from '../contexts/FarmerContext.jsx';   // ⬅️ changed
import { useEffect } from 'react';
import axios from 'axios';
import refreshAccessToken from './refreshAccessToken.js';
import Loading from '../Components/Loading.jsx';

const FarmerProtectWrapper = ({ children }) => {
    
    const { isAuthenticated, setIsAuthenticated, isLoading, setIsLoading } = useAuth();
    const { setFarmer } = useFarmer();   // ⬅️ changed
    const navigate = useNavigate();

    useEffect(() => {
        const checkAuthStatus = async () => {
            try {
                if (localStorage.getItem("isLoggedIn") === 'false') {
                    setIsAuthenticated(false);
                    setIsLoading(false);
                    return;
                }

                // Fetch farmer info with current access token
                const response = await axios.get(
                    `${import.meta.env.VITE_SERVER_BASE_URL}/auth/farmer-info`, // ⬅️ endpoint changed
                    { withCredentials: true }
                );

                if (response.data.success) {
                    setIsAuthenticated(true);
                    setFarmer(response.data.data); // ⬅️ changed
                }

            } catch (error) {
                console.log('Farmer info request failed:', error);

                if (error.response?.status === 401 || error.response?.status === 400) {
                    console.log('Access token expired, attempting refresh...');
                    
                    const refreshResult = await refreshAccessToken();

                    if (refreshResult.success) {
                        console.log('Token refresh successful');
                        setIsAuthenticated(true);
                        setFarmer(refreshResult.farmer); // ⬅️ changed
                    } else {
                        console.log('Token refresh failed:', refreshResult.error);
                        setIsAuthenticated(false);
                        localStorage.setItem("isLoggedIn", "false");

                        if (refreshResult.shouldLogout) {
                            navigate('/auth');
                        }
                    }
                } else {
                    console.log('Network or server error:', error);
                    setIsAuthenticated(false);
                    localStorage.setItem("isLoggedIn", "false");
                }
            } finally {
                setIsLoading(false);
            }
        };

        checkAuthStatus();
    }, [setIsAuthenticated, setIsLoading, setFarmer, navigate]); // ⬅️ changed

    if (isLoading) {
        return <Loading message='Loading, Please Wait' />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/auth" replace />;
    }

    return children;
};

export default FarmerProtectWrapper;
