const fs = require("fs");
const path = require("path");
const Trip = require("../../models/office/trip");
const Location = require("../../models/office/location");
const Diesel = require("../../models/office/diesel");

exports.createApkTrip = (req, res, next) => {
  console.log('first')
  let odometer_image_path;
  let odometer_done_image_path;

  if (req.files.length >= 2) {
    odometer_image_path = req.files[0].path.replace("\\", "/");
    odometer_done_image_path = req.files[1].path.replace("\\", "/");
  }

  let trip_id;

  const {
    vehicle_id,
    charging,
    odometer,
    odometer_done,
    companion,
    others,
    points,
    trip_date,
  } = req.body;

  const tripObj = {
    user_id: req.userId,
    vehicle_id,
    charging: charging || null,
    odometer: odometer || null,
    odometer_done: odometer_done || null,
    odometer_image_path: odometer_image_path || null,
    odometer_done_image_path: odometer_done_image_path || null,
    companion: (companion && JSON.parse(companion)) || [],
    points: (points && JSON.parse(points)) || [],
    others: others || "",
    trip_date: trip_date || new Date(),
  };

  Trip.create(tripObj)
    .then((result) => {
      trip_id = result._id;

      const locationsPromises = (Boolean(req.body?.locations?.length) && JSON.parse(req.body.locations) || []).map(
        (location) => {
          return Location.create({ trip_id: trip_id, ...location }).then(
            async (result) => {
              if (result?._id) {
                await Trip.updateOne(
                  { _id: trip_id },
                  { $push: { locations: result._id } }
                );
              }
            }
          );
        }
      );

      const dieselsPromises = (Boolean(req.body?.diesels?.length) && JSON.parse(req.body.diesels) || []).map(
        (diesel) => {
          return Diesel.create({ trip_id: trip_id, ...diesel }).then(
            async (result) => {
              if (result?._id) {
                await Trip.updateOne(
                  { _id: trip_id },
                  { $push: { diesels: result._id } }
                );
              }
            }
          );
        }
      );

      return Promise.all([...locationsPromises, ...dieselsPromises]);
    })
    .then(() => {
      Trip.findById({ _id: trip_id })
        .populate({
          path: "locations",
          options: { sort: { date: 1 } },
        })
        .populate("diesels")
        .populate("user_id", {
          employee_id: 1,
          first_name: 2,
          last_name: 3,
          department: 4,
        })
        .populate("vehicle_id", { plate_no: 1, name: 2 })
        .then((trip) => {
          res
            .status(201)
            .json({ message: "Done creating apk trip", data: trip });
        });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.getApkTrips = (req, res, next) => {
  const currentPage = req.query.page || 1;
  const perPage = req.query.limit || 25;
  let searchItem = req.query.search || "";
  const dateItem = req.query.date;

  const filter =
    dateItem !== "null"
      ? {
          user_id: searchItem,
          ["trip_date"]: {
            $gte: `${dateItem}T00:00:00`,
            $lte: `${dateItem}T23:59:59`,
          },
        }
      : { user_id: searchItem };

  Trip.find(filter)
    .populate({
      path: "locations",
      options: { sort: { date: 1 } },
    })
    .populate("diesels")
    .populate("user_id", {
      employee_id: 1,
      first_name: 2,
      last_name: 3,
      department: 4,
      trip_template: 5,
    })
    .populate("vehicle_id", { plate_no: 1, name: 2 })
    .sort({ createdAt: "desc" })
    .skip((currentPage - 1) * perPage)
    .limit(perPage)
    .then((result) => {
      res.status(200).json({
        data: result,
        pagination: {
          totalItems: result.length,
          currentPage: parseInt(currentPage),
        },
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};
 
// OLD GET TRIPS 
exports.getTrips = (req, res, next) => {
  
  const currentPage = req.query.page || 1;
  const perPage = req.query.limit || 25;
  let searchItem = req.query.search || "";
  const searchBy = req.query.searchBy || "_id";
  const dateItem = req.query.date;
  const userDepartment = req?.department;
  const show_all_departments = req?.show_all_departments;

  const filter =
    searchBy === "trip_date" || searchBy === "createdAt"
      ? {
          [searchBy]: {
            $gte: `${dateItem}T00:00:00`,
            $lte: `${dateItem}T23:59:59`,
          },
        }
      : {};

  Trip.find(filter)
    .countDocuments()
    .then((count) => {
      totalItems = count;
      return Trip.find(filter)
        .populate({
          path: "locations",
          options: { sort: { date: 1 } },
        })
        .populate("diesels")
        .populate("user_id", {
          employee_id: 1,
          first_name: 2,
          last_name: 3,
          department: 4,
        })
        .populate("vehicle_id", { plate_no: 1 })
        .sort({ createdAt: "desc" })
        .then((trips) => {
          const newTrip = trips.filter((trip) => {
            // valdiation to not filter by department if user is audit or developer and support
            if (show_all_departments) {
              return trip;
            } else {
              return trip?.user_id?.department
                .toString()
                .includes(userDepartment);
            }
          });

          if (searchBy === "trip_date" || searchBy === "createdAt") {
            return newTrip;
          } else {
            return newTrip.filter((trip) => {
              searchItem = searchItem.toLowerCase();
              const searchProps = searchBy.split(".");
              let obj = trip;
              for (const prop of searchProps) {
                obj = obj[prop];
                if (Array.isArray(obj)) {
                  if (prop === "companion") {
                    return obj.find((el) =>
                      el.first_name
                        .toString()
                        .toLowerCase()
                        .includes(searchItem)
                    );
                  }
                  return obj.find(
                    (el) =>
                      el && el.toString().toLowerCase().includes(searchItem)
                  );
                }
                if (!obj) return false;
              }
              return obj.toString().toLowerCase().includes(searchItem);
            });
          }
        });
    })
    .then((result) => {
      res.status(200).json({
        data:
          perPage <= 0 || perPage === "undefined"
            ? result
            : result.slice(
                (currentPage - 1) * perPage,
                parseInt((currentPage - 1) * perPage) + parseInt(perPage)
              ),
        pagination: {
          totalItems: result.length,
          limit: parseInt(perPage),
          currentPage: parseInt(currentPage),
        },
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};


// New get trips
exports.fetchAllTrips = async (req, res, next) => {
  const { page, limit } = req?.query;

  try {
    let pageNumber = parseInt(page) || 1;
    let itemsPerPage = parseInt(limit) || 0; // set to 0 for the reports

    // If page or limit is undefined, remove pagination
    if (isNaN(pageNumber) || isNaN(itemsPerPage)) {
      pageNumber = 1;
      itemsPerPage = 0; // Set to 0 to retrieve all data
    }

    const skipValue = (pageNumber - 1) * itemsPerPage;
    let searchItem = req.query.search || "";
    const searchBy = req.query.searchBy || "_id";
    const dateItem = req.query.date;
    const userDepartment = req?.department;
    const show_all_departments = req?.show_all_departments;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;
    
    let totalItems;
    
    let filter =
      searchBy === "trip_date" || searchBy === "createdAt"
        ? {
            [searchBy]: {
              $gte: `${dateFrom}T00:00:00`,
              $lte: `${dateTo}T23:59:59`,
            },
          }
        : {};

    let sort;

    if (searchBy === "trip_date") {
      sort = { trip_date: "asc" };
    }
    else if (searchBy === "createdAt") {
      sort = { createdAt: "asc" };
    }else{
      sort = { createdAt: "desc" };
    }
    
    const all_trips = await Trip.find(filter)
      .populate({
        path: "locations",
        options: { sort: { date: 1 } },
      })
      .populate("diesels")
      .populate("user_id", {
        employee_id: 1,
        first_name: 2,
        last_name: 3,
        department: 4,
      })
      .populate("vehicle_id", { plate_no: 1 , km_per_liter: 2})
      .sort(sort) 
      .skip(skipValue)
      .limit(itemsPerPage);        

    // Apply additional filtering based on searchBy and searchItem
    const filteredTrips = all_trips.filter((trip) => {
      searchItem = searchItem.toLowerCase();
      const searchProps = searchBy.split(".");
      let obj = trip;
      for (const prop of searchProps) {
        obj = obj[prop];
        if (Array.isArray(obj)) {
          if (prop === "companion") {
            return obj.find((el) =>
              el.first_name
                .toString()
                .toLowerCase()
                .includes(searchItem)
            );
          }
          return obj.find(
            (el) =>
              el && el.toString().toLowerCase().includes(searchItem)
          );
        }
        if (!obj) return false;
      }
      return obj.toString().toLowerCase().includes(searchItem);
    });

    if (searchItem != null && searchItem !== "") {
      totalItems = filteredTrips.length;
    } else {
      totalItems = await Trip.countDocuments(filter);
    }

    const result = {
      message: "Success get SG Trips",
      data: filteredTrips,
      pagination:{
        totalItems: totalItems,
        limit: itemsPerPage,
        currentPage: pageNumber,
      },
      previous_page:
        pageNumber > 1 && filteredTrips?.length ? pageNumber - 1 : null,
      next_page:
        itemsPerPage < totalItems && filteredTrips?.length ? pageNumber + 1 : null,
    };
    res.status(200).json(result);
    return next();
  } catch (error) {
    // Handle the error appropriately
    res.status(500).json({ error: "Internal Server Error" });
    return next(error);
  }
};


exports.updateTrip = (req, res, next) => {
  const tripId = req.params.tripId;
  let newImageURL;

  if (req.file) {
    newImageURL = req.file.path.replace("\\", "/");
  }

  const user_id = req.body.user_id || null;
  const vehicle_id = req.body.vehicle_id || null;
  const odometer = req.body.odometer || null;
  const odometer_done = req.body.odometer_done || null;
  const odometer_image_path = newImageURL || null;
  const companion = req.body.companion || null;
  const others = req.body.others || null;
  const points = req.body.points || null;
  const charging = req.body.charging || null;

  Trip.findById(tripId)
    .then((trip) => {
      if (!trip) {
        const error = new Error("Could not find trip");
        error.statusCode = 404;
        throw error;
      }

      if (req.file && odometer_image_path !== trip.odometer_image_path) {
        clearImage(trip.odometer_image_path);
      }

      return Trip.findOneAndUpdate(
        { _id: trip._id },
        {
          user_id: user_id || trip.user_id,
          vehicle_id: vehicle_id || trip.vehicle_id,
          odometer: odometer || trip.odometer,
          odometer_done: odometer_done || trip.odometer_done,
          odometer_image_path: odometer_image_path || trip.odometer_image_path,
          companion: companion || trip.companion,
          others: others || trip.others,
          points: points || trip.points,
          charging: charging || trip.charging,
        },
        { new: true }
      )
        .populate("locations")
        .populate("diesels")
        .populate("user_id", { trip_template: 1 })
        .populate("vehicle_id", { name: 1 });
    })
    .then((result) => {
      res.status(200).json({
        messsage: "Trip update successfully",
        data: result,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deleteTrip = (req, res, next) => {
  if (req.role !== "admin") {
    const error = new Error("Please make sure you're an admin");
    error.statusCode = 403;
    throw error;
  }

  const tripId = req.params.tripId;

  Trip.findById(tripId)
    .then((trip) => {
      if (!trip) {
        const error = new Error("Could not found trip");
        error.statusCode = 404;
        throw error;
      }

      if (trip?.odometer_image_path) {
        clearImage(trip.odometer_image_path);
      }

      // Delete all location related to trip id
      Location.find({ trip_id: tripId }).then((location) => {
        if (!location) {
          return null;
        }
        location.map(async (item) => {
          await Location.findByIdAndRemove(item._id);
        });
      });

      // Delete all diesel related to trip id
      Diesel.find({ trip_id: tripId }).then((diesel) => {
        if (!diesel) {
          return null;
        }
        diesel.map(async (item) => {
          await Diesel.findByIdAndRemove(item._id);
        });
      });

      return Trip.findByIdAndRemove(tripId);
    })
    .then((result) => {
      res.status(200).json({
        message: "Success delete trip",
        data: result,
      });
    })
    .catch((err) => {  
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

exports.deleteAllTrips = (req, res, next) => {
  if (req.role !== "admin") {
    const error = new Error("Please make sure you're an admin");
    error.statusCode = 403;
    throw error;
  }
  const userId = req.params.userId;

  Trip.find({ user_id: userId })
    .then((trips) => {
      if (!trips) {
        const error = new Error("Could not find trip");
        error.statusCode = 404;
        throw error;
      }

      trips.map(async (item) => {
        await Location.find({ trip_id: item._id }).then((locations) => {
          locations.map(async (locItem) => {
            await Location.findByIdAndRemove(locItem._id);
          });
        });

        await Diesel.find({ trip_id: item._id }).then((diesels) => {
          diesels.map(async (diesel) => {
            await Diesel.findByIdAndRemove(diesel._id);
          });
        });

        await Trip.findByIdAndRemove(item._id);

        if (item?.odometer_image_path) {
          clearImage(item.odometer_image_path);
        }
      });

      res.status(200).json({ message: "delete all trips successfully" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

const clearImage = (filePath) => {
  filePath = path.join(__dirname, "../..", filePath);
  fs.unlink(filePath, (err) => console.log(err));
};








