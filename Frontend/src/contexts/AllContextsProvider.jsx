import FarmerContextProvider from "./FarmerContext.jsx" // Fixed import path case


const AllContextsProvider = ({ children }) => {

    return (
        <FarmerContextProvider>
            { children }
        </FarmerContextProvider>
    )
}

export default AllContextsProvider