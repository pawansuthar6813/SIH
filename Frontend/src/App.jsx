
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'

const App = () => {
  return (
    <div className='h-screen w-screen flex justify-center items-center bg-amber-400'>
      <div className='h-[640px] w-[360px] bg-red-400'>
      <Routes>

        {/* user routes */}
        <Route path='/' element={<Home />} />

        {/* admin routes */}

        {/* expert routes */}
      </Routes>
    </div>
    </div>
      
   
  )
}

export default App