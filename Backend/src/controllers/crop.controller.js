import models from "../models/index.js";
import catchAsyncError from "../middlewares/catchAsyncError.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";


const addCropController = catchAsyncError(async (req, res, next) => {

    const {
      mobileNumber,
      cropName,
      cropVariety,
      fieldLocation,       // lat, long (from location access)
      fieldArea,      // number or string
      farmingType,    // e.g., organic, traditional
      plantingDate,   // date
      irrigationType  // e.g., drip, flood
    } = req.body;

    const farmer = await userModel.findOne({mobileNumber});
    const farmerId = farmer._id;

    

    const photoOfSoil = req.file ? req.file.path : null; // multer for photo upload

    // ai model call

    // create crop
    const newCrop = new Crop({
      farmerId,
      cropName,
      cropVariety,
      location,
      fieldArea,
      farmingType,
      plantingDate,
      soilImage: photoOfSoil,
      irrigationType
    });

    await newCrop.save();

    // also push into farmer's crop list
    await userModel.findByIdAndUpdate(farmerId, { $push: { crops: newCrop._id } });

    const response = new ApiResponse(201, "crop addedd successfully", newCrop);

    return res.status(response.statusCode).json(response); 
})


const cropControllers = {
    addCropController
}

export default cropControllers