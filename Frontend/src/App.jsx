
import { Route, Routes } from 'react-router-dom'
import Home from './pages/Home.jsx'
import KisanSahayak from './pages/KisanSahayak.jsx'

const App = () => {
  return (
    <div className='h-screen w-screen flex justify-center items-center bg-amber-400'>
      <div className='h-[640px] w-[360px] bg-red-400'>
      <Routes>

        {/* user routes */}
        <Route path='/' element={<Home />} />
        <Route path='/kisaan-sahayak' element={<KisanSahayak />} />

        {/* admin routes */}

        {/* expert routes */}
      </Routes>
    </div>
    </div>
      
   
  )
}

export default App