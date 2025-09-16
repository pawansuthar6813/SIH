import { createContext, useContext, useState } from "react";

export const FarmerContext = createContext();

const FarmerContextProvider = ({children}) => {
    const [farmer, setFarmer] = useState(null);

    return (
        <FarmerContext.Provider value={{farmer, setFarmer}}>
            {children}
        </FarmerContext.Provider>
    )
}

export const useFarmer = () => {
    return useContext(FarmerContext);
}

export default FarmerContextProvider;