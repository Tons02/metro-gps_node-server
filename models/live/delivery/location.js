const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const locationSchema = new Schema({
  trip_id: {
    type: Schema.Types.ObjectId,
    ref: "TripLive",
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  lat: {
    type: Number,
    // required: true,
  },
  long: {
    type: Number,
    // required: true,
  },
  status: {
    type: String,
    required: true,
  },
  address: {
    type: JSON,
  },
  odometer: {
    type: Number,
  },
  destination: {
    type: String,
  },
});

module.exports = mongoose.model("LocationLive", locationSchema);
