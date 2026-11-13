/**
 * WoodCraft Pro - Main Server & Customer-Facing Application
 * Tagline: "Crafting Comfort, One Home at a Time."
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');

const app = express();

// ==========================================
// 1. DATABASE & CACHED CONNECTION (Vercel Serverless)
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/woodcraft_pro';

let cachedConnection = global.mongoose;
if (!cachedConnection) {
  cachedConnection = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cachedConnection.conn) return cachedConnection.conn;
  if (!cachedConnection.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    };
    cachedConnection.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
  }
  try {
    cachedConnection.conn = await cachedConnection.promise;
    await seedInitialData();
    return cachedConnection.conn;
  } catch (err) {
    cachedConnection.promise = null;
    console.error('MongoDB Connection Error:', err.message);
    throw err;
  }
}

// ==========================================
// 2. MONGOOSE MODELS & SCHEMAS
// ==========================================
const ServiceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  category: { type: String, required: true },
  startingPrice: { type: Number, required: true },
  duration: { type: String, default: '2-4 hours' },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const CarpenterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialization: { type: String, required: true },
  experienceYears: { type: Number, required: true },
  rating: { type: Number, default: 4.9 },
  phone: { type: String, default: '+91 98765 00000' },
  photoUrl: { type: String, required: true },
  skills: [{ type: String }],
  isAvailable: { type: Boolean, default: true },
  completedProjects: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const BookingSchema = new mongoose.Schema({
  bookingId: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, required: true, trim: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  area: { type: String, default: '' },
  pincode: { type: String, required: true },
  services: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
    name: String,
    price: Number
  }],
  projectTitle: { type: String, required: true },
  description: { type: String, required: true },
  typeOfWork: { type: String, default: 'Repair' },
  budget: { type: Number, default: 0 },
  images: [{ type: String }],
  preferredDate: { type: Date, required: true },
  timeSlot: { type: String, enum: ['Morning', 'Afternoon', 'Evening'], default: 'Morning' },
  assignedCarpenter: { type: mongoose.Schema.Types.ObjectId, ref: 'Carpenter', default: null },
  estimatedPrice: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['Pending', 'Partial', 'Paid', 'Refunded'], default: 'Pending' },
  status: {
    type: String,
    enum: [
      'Pending',
      'Confirmed',
      'Carpenter Assigned',
      'Inspection Scheduled',
      'Work In Progress',
      'Completed',
      'Cancelled'
    ],
    default: 'Pending',
    index: true
  },
  adminNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const GallerySchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: {
    type: String,
    enum: ['Furniture', 'Wardrobes', 'Kitchens', 'Doors', 'Interiors', 'Repairs'],
    required: true
  },
  imageUrl: { type: String, required: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const ReviewSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  review: { type: String, required: true },
  serviceCompleted: { type: String, required: true },
  avatarUrl: { type: String },
  isVerified: { type: Boolean, default: false }, // Disclosed as demo data
  createdAt: { type: Date, default: Date.now }
});

const SettingsSchema = new mongoose.Schema({
  businessName: { type: String, default: 'WoodCraft Pro' },
  tagline: { type: String, default: 'Crafting Comfort, One Home at a Time.' },
  phone: { type: String, default: '+91 98765 43210' },
  whatsapp: { type: String, default: '+91 98765 43210' },
  email: { type: String, default: 'hello@woodcraftpro.example' },
  address: { type: String, default: '24 Civil Lines, Prayagraj, Uttar Pradesh, India' },
  serviceArea: { type: String, default: 'Prayagraj & Surrounding Regions' },
  statsProjects: { type: String, default: '1,250+' },
  statsCarpenters: { type: String, default: '15+' },
  statsRating: { type: String, default: '4.9/5' },
  statsExperience: { type: String, default: '8+ Years' },
  updatedAt: { type: Date, default: Date.now }
});

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  name: { type: String, default: 'Administrator' },
  role: { type: String, default: 'superadmin' },
  createdAt: { type: Date, default: Date.now }
});

const Service = mongoose.models.Service || mongoose.model('Service', ServiceSchema);
const Carpenter = mongoose.models.Carpenter || mongoose.model('Carpenter', CarpenterSchema);
const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
const GalleryItem = mongoose.models.GalleryItem || mongoose.model('GalleryItem', GallerySchema);
const Review = mongoose.models.Review || mongoose.model('Review', ReviewSchema);
const Setting = mongoose.models.Setting || mongoose.model('Setting', SettingsSchema);
const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema);

// Export models so admin.js can reuse them
module.exports.models = { Service, Carpenter, Booking, GalleryItem, Review, Setting, AdminUser };
module.exports.connectToDatabase = connectToDatabase;

// ==========================================
// 3. SAMPLE DATA SEEDER (Controlled)
// ==========================================
async function seedInitialData() {
  const serviceCount = await Service.countDocuments();
  if (serviceCount === 0) {
    await Service.insertMany([
      {
        name: 'Furniture Repair',
        slug: 'furniture-repair',
        category: 'Repair',
        startingPrice: 299,
        duration: '1-3 Hours',
        description: 'Fast fix for loose joints, wobbling dining chairs, broken hinges, and creaking beds.',
        imageUrl: 'https://images.unsplash.com/photo-1581539250439-c96689b516dd?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Custom Furniture Making',
        slug: 'custom-furniture',
        category: 'Manufacturing',
        startingPrice: 1499,
        duration: '3-7 Days',
        description: 'Bespoke solid wood dining tables, study desks, and accent console units built to order.',
        imageUrl: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Wardrobe Installation',
        slug: 'wardrobe-installation',
        category: 'Interiors',
        startingPrice: 799,
        duration: '1-2 Days',
        description: 'Sliding and hinged wardrobe assemblies, hydraulic lifters, and custom loft framing.',
        imageUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Door & Window Repair',
        slug: 'door-window-repair',
        category: 'Repair',
        startingPrice: 399,
        duration: '1-2 Hours',
        description: 'Door misalignment correction, lock replacement, window latch fixing, and weatherstripping.',
        imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Modular Kitchen Woodwork',
        slug: 'modular-kitchen',
        category: 'Renovation',
        startingPrice: 2499,
        duration: '3-5 Days',
        description: 'Waterproof marine ply cabinetry, tandem drawers, soft-close baskets, and chimney framing.',
        imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Bed & Sofa Repair',
        slug: 'bed-sofa-repair',
        category: 'Repair',
        startingPrice: 599,
        duration: '2-4 Hours',
        description: 'Hydraulic storage repairs, structural frame reinforcement, and sofa spring fixing.',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Wooden Flooring',
        slug: 'wooden-flooring',
        category: 'Flooring',
        startingPrice: 1999,
        duration: '1-3 Days',
        description: 'High-density laminate and engineered hardwood flooring installation with acoustic underlay.',
        imageUrl: 'https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Office Furniture Installation',
        slug: 'office-furniture',
        category: 'Commercial',
        startingPrice: 899,
        duration: '4-8 Hours',
        description: 'Ergonomic workstation setups, partition panels, conference room tables, and drawer pedestals.',
        imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Custom Shelves & Cabinets',
        slug: 'shelves-cabinets',
        category: 'Interiors',
        startingPrice: 699,
        duration: '3-6 Hours',
        description: 'Floating bookshelves, wall-mounted entertainment consoles, and utility store shelving.',
        imageUrl: 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?auto=format&fit=crop&w=700&q=80'
      },
      {
        name: 'Complete Home Carpentry',
        slug: 'complete-home-carpentry',
        category: 'Turnkey',
        startingPrice: 2999,
        duration: '1-3 Weeks',
        description: 'End-to-end turnkey woodwork for new flats, including doors, ceiling paneling, and moldings.',
        imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=700&q=80'
      }
    ]);
  }

  const carpenterCount = await Carpenter.countDocuments();
  if (carpenterCount === 0) {
    await Carpenter.insertMany([
      {
        name: 'Rahul Sharma',
        specialization: 'Senior Carpenter & Structural Wood',
        experienceYears: 8,
        rating: 4.95,
        phone: '+91 98111 22334',
        photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
        skills: ['Hardwood Joinery', 'Roof Trussing', 'Timber Finishing', 'Bed Engineering'],
        isAvailable: true,
        completedProjects: 412
      },
      {
        name: 'Amit Verma',
        specialization: 'Furniture Specialist',
        experienceYears: 6,
        rating: 4.88,
        phone: '+91 98222 33445',
        photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
        skills: ['Custom Dining Sets', 'Sofa Frame Restoration', 'Veneer Edge Banding'],
        isAvailable: true,
        completedProjects: 285
      },
      {
        name: 'Vikram Singh',
        specialization: 'Interior Woodwork Expert',
        experienceYears: 7,
        rating: 4.92,
        phone: '+91 98333 44556',
        photoUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80',
        skills: ['Modular Kitchens', 'Walk-in Wardrobes', 'Wall Paneling', 'Acoustic Baffles'],
        isAvailable: true,
        completedProjects: 340
      },
      {
        name: 'Mohit Kumar',
        specialization: 'Furniture Repair Specialist',
        experienceYears: 5,
        rating: 4.85,
        phone: '+91 98444 55667',
        photoUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=400&q=80',
        skills: ['Door Alignments', 'Antique Restoration', 'Hardware Upgrades', 'Quick Fixes'],
        isAvailable: true,
        completedProjects: 230
      }
    ]);
  }

  const galleryCount = await GalleryItem.countDocuments();
  if (galleryCount === 0) {
    await GalleryItem.insertMany([
      {
        title: 'Teakwood Dining Masterpiece',
        category: 'Furniture',
        imageUrl: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?auto=format&fit=crop&w=800&q=80',
        description: 'Handcrafted 8-seater dining table made of seasoned Indian Teak with matte polyurethane lacquer.'
      },
      {
        title: 'Walk-In Floor-To-Ceiling Wardrobe',
        category: 'Wardrobes',
        imageUrl: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&w=800&q=80',
        description: 'Smoke-grey laminate with internal warm LED sensor strips and concealed BLUM hinges.'
      },
      {
        title: 'Island Modular Kitchen in Walnut',
        category: 'Kitchens',
        imageUrl: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=800&q=80',
        description: 'Complete moisture-resistant marine ply modular setup with quartz countertop integration.'
      },
      {
        title: 'Carved Royal Entrance Double Door',
        category: 'Doors',
        imageUrl: 'https://images.unsplash.com/photo-1534177616072-ef7dc120449d?auto=format&fit=crop&w=800&q=80',
        description: 'Solid Sheesham double door with brass inlays and multi-point smart security lock.'
      },
      {
        title: 'Modern Minimalist TV Accent Wall',
        category: 'Interiors',
        imageUrl: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80',
        description: 'Fluted wooden louvers with floating marble-look console and cable management conduit.'
      },
      {
        title: 'Vintage Rocking Chair Restoration',
        category: 'Repairs',
        imageUrl: 'https://images.unsplash.com/photo-1580481077112-70b741005b4a?auto=format&fit=crop&w=800&q=80',
        description: 'Preserved 40-year heirloom chair with dowel joint reinforcing and natural beeswax polish.'
      }
    ]);
  }

  const reviewCount = await Review.countDocuments();
  if (reviewCount === 0) {
    await Review.insertMany([
      {
        customerName: 'Priya Sundaram',
        rating: 5,
        review: 'Mohit arrived right on time and fixed our sagging sliding wardrobe doors in under 45 minutes. Super polite and spotless cleanup afterwards!',
        serviceCompleted: 'Wardrobe Installation & Repair',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
        isVerified: false
      },
      {
        customerName: 'Rajesh Malviya',
        rating: 5,
        review: 'Custom ordered a study desk and bookshelf for my home office. Rahul did incredible work matching the exact stain of my existing flooring.',
        serviceCompleted: 'Custom Furniture Making',
        avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
        isVerified: false
      },
      {
        customerName: 'Ananya Deshmukh',
        rating: 5,
        review: 'The booking experience on this website was seamless! Tracking status kept me updated at every step. Truly professional home carpentry.',
        serviceCompleted: 'Modular Kitchen Woodwork',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        isVerified: false
      }
    ]);
  }

  const settingsCount = await Setting.countDocuments();
  if (settingsCount === 0) {
    await Setting.create({});
  }

  // Ensure Admin User exists
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@woodcraftpro.com';
  const existingAdmin = await AdminUser.findOne({ email: adminEmail.toLowerCase() });
  if (!existingAdmin) {
    const rawPassword = process.env.ADMIN_PASSWORD || 'WoodCraft@2026';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(rawPassword, salt);
    await AdminUser.create({
      email: adminEmail.toLowerCase(),
      passwordHash,
      name: 'Master Carpenter Admin',
      role: 'superadmin'
    });
  }
}

// ==========================================
// 4. CLOUDINARY & MULTER CONFIGURATION
// ==========================================
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG and WEBP image files are allowed.'));
    }
  }
});

// Helper for image upload to Cloudinary with fallback
async function uploadToCloudinary(buffer, folder = 'woodcraft_pro') {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    // Return high-resolution carpentry placeholder if Cloudinary not configured
    return 'https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=800&q=80';
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ==========================================
// 5. SECURITY & MIDDLEWARE
// ==========================================
app.use(helmet({
  contentSecurityPolicy: false // Allows dynamic CDN fonts, icons and unsplash imagery
}));
app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure DB connection on all requests
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failure. Please verify MONGODB_URI.' });
  }
});

// Rate limiters for public forms and API
const publicFormLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' }
});

// ==========================================
// 6. PUBLIC REST APIS
// ==========================================

// Get Services
app.get('/api/services', async (req, res) => {
  try {
    const services = await Service.find({ isActive: true }).sort({ startingPrice: 1 });
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Team
app.get('/api/team', async (req, res) => {
  try {
    const carpenters = await Carpenter.find().sort({ experienceYears: -1 });
    res.json({ success: true, data: carpenters });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Gallery
app.get('/api/gallery', async (req, res) => {
  try {
    const category = req.query.category;
    const query = category && category !== 'All' ? { category } : {};
    const items = await GalleryItem.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Reviews
app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Settings
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Setting.findOne() || {};
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create Customer Booking
app.post('/api/bookings', publicFormLimiter, upload.array('projectImages', 4), async (req, res) => {
  try {
    const {
      customerName,
      phone,
      email,
      address,
      city,
      area,
      pincode,
      services, // stringified JSON array of IDs or names
      projectTitle,
      description,
      typeOfWork,
      budget,
      preferredDate,
      timeSlot,
      preferredCarpenter
    } = req.body;

    if (!customerName || !phone || !email || !address || !city || !pincode || !preferredDate || !projectTitle) {
      return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    // Validate phone number format
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit mobile number.' });
    }

    // Parse and validate services from DB
    let parsedServiceIds = [];
    if (typeof services === 'string') {
      try {
        parsedServiceIds = JSON.parse(services);
      } catch {
        parsedServiceIds = [services];
      }
    } else if (Array.isArray(services)) {
      parsedServiceIds = services;
    }

    const dbServices = await Service.find({ _id: { $in: parsedServiceIds } });
    if (dbServices.length === 0) {
      return res.status(400).json({ success: false, error: 'Please select at least one valid carpentry service.' });
    }

    // Calculate baseline estimated price server-side
    const calculatedEstimate = dbServices.reduce((sum, s) => sum + s.startingPrice, 0);

    // Process image uploads
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const url = await uploadToCloudinary(file.buffer, 'woodcraft_customer_uploads');
          imageUrls.push(url);
        } catch (uploadErr) {
          console.warn('Image upload skipped:', uploadErr.message);
        }
      }
    }

    // Generate Human-friendly Unique Booking ID: WCP-2026-XXXXX
    const year = new Date().getFullYear();
    const count = await Booking.countDocuments();
    const padded = String(count + 1).padStart(5, '0');
    const bookingId = `WCP-${year}-${padded}`;

    const newBooking = new Booking({
      bookingId,
      customerName: customerName.trim(),
      phone: cleanPhone,
      email: email.trim().toLowerCase(),
      address: address.trim(),
      city: city.trim(),
      area: (area || '').trim(),
      pincode: pincode.trim(),
      services: dbServices.map(s => ({ serviceId: s._id, name: s.name, price: s.startingPrice })),
      projectTitle: projectTitle.trim(),
      description: (description || '').trim(),
      typeOfWork: typeOfWork || 'General Woodwork',
      budget: Number(budget) || calculatedEstimate,
      images: imageUrls,
      preferredDate: new Date(preferredDate),
      timeSlot: timeSlot || 'Morning',
      assignedCarpenter: preferredCarpenter && mongoose.isValidObjectId(preferredCarpenter) ? preferredCarpenter : null,
      estimatedPrice: calculatedEstimate,
      finalPrice: calculatedEstimate,
      status: 'Pending'
    });

    await newBooking.save();

    res.status(201).json({
      success: true,
      message: 'Booking request registered successfully!',
      booking: {
        bookingId: newBooking.bookingId,
        customerName: newBooking.customerName,
        phone: newBooking.phone,
        preferredDate: newBooking.preferredDate,
        timeSlot: newBooking.timeSlot,
        estimatedPrice: newBooking.estimatedPrice,
        status: newBooking.status
      }
    });
  } catch (err) {
    console.error('Booking submission error:', err);
    res.status(500).json({ success: false, error: 'Unable to submit booking. ' + err.message });
  }
});

// Track Booking (Strict check on ID + Phone)
app.post('/api/bookings/track', publicFormLimiter, async (req, res) => {
  try {
    const { bookingId, phone } = req.body;
    if (!bookingId || !phone) {
      return res.status(400).json({ success: false, error: 'Both Booking ID and registered Phone number are required.' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const booking = await Booking.findOne({
      bookingId: bookingId.trim().toUpperCase(),
      phone: cleanPhone
    }).populate('assignedCarpenter', 'name specialization phone rating photoUrl');

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'No matching booking found. Please verify both your Booking ID and Phone Number.'
      });
    }

    const statusSteps = [
      'Pending',
      'Confirmed',
      'Carpenter Assigned',
      'Inspection Scheduled',
      'Work In Progress',
      'Completed'
    ];

    res.json({
      success: true,
      data: {
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        projectTitle: booking.projectTitle,
        services: booking.services,
        preferredDate: booking.preferredDate,
        timeSlot: booking.timeSlot,
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        estimatedPrice: booking.estimatedPrice,
        finalPrice: booking.finalPrice,
        assignedCarpenter: booking.assignedCarpenter,
        createdAt: booking.createdAt,
        statusSteps,
        currentStepIndex: statusSteps.indexOf(booking.status)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Contact Form Handler
app.post('/api/contact', publicFormLimiter, (req, res) => {
  const { name, phone, message } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, error: 'Name and Phone number are required.' });
  }
  // In a live system this can dispatch SMS/Email. Returning success demo confirmation.
  res.json({
    success: true,
    message: 'Thank you for reaching out! Our lead carpenter will call you within 30 minutes.'
  });
});

// ==========================================
// 7. MOUNT ADMIN MODULE
// ==========================================
const adminModule = require('./admin');
app.use('/admin', adminModule.adminHtmlRouter);
app.use('/api/admin', adminModule.adminApiRouter);

// ==========================================
// 8. CUSTOMER-FACING FRONTEND (SSR + Claymorphism)
// ==========================================
app.get('/', async (req, res) => {
  try {
    const [services, carpenters, gallery, reviews, settings] = await Promise.all([
      Service.find({ isActive: true }).sort({ startingPrice: 1 }),
      Carpenter.find().sort({ experienceYears: -1 }),
      GalleryItem.find().sort({ createdAt: -1 }),
      Review.find().sort({ createdAt: -1 }),
      Setting.findOne() || {}
    ]);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderCustomerHtml({ services, carpenters, gallery, reviews, settings }));
  } catch (err) {
    res.status(500).send(`<h3>Server Error rendering page: ${err.message}</h3>`);
  }
});

// ==========================================
// 9. CLIENT HTML TEMPLATE GENERATOR
// ==========================================
function renderCustomerHtml({ services, carpenters, gallery, reviews, settings }) {
  const safeSettings = {
    businessName: settings.businessName || 'WoodCraft Pro',
    tagline: settings.tagline || 'Crafting Comfort, One Home at a Time.',
    phone: settings.phone || '+91 98765 43210',
    whatsapp: settings.whatsapp || '+91 98765 43210',
    email: settings.email || 'hello@woodcraftpro.example',
    address: settings.address || '24 Civil Lines, Prayagraj, UP, India',
    statsProjects: settings.statsProjects || '1,250+',
    statsCarpenters: settings.statsCarpenters || '15+',
    statsRating: settings.statsRating || '4.9/5',
    statsExperience: settings.statsExperience || '8+ Years'
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSettings.businessName} | ${safeSettings.tagline}</title>
  <meta name="description" content="Professional carpenter and home woodwork services. Custom furniture, fast home repair, wardrobe builds, modular kitchens and wood flooring.">

  <!-- Google Fonts: Poppins & Inter -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">

  <!-- Font Awesome & Lucide Icons -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <style>
    /* ===================================================
       CLAYMORPHISM DESIGN SYSTEM & CSS VARIABLES
       =================================================== */
    :root {
      --primary: #FF8A5B;
      --primary-hover: #f17846;
      --secondary: #FFC857;
      --accent: #8C7BFF;
      --mint: #79DCC8;
      --bg-cream: #FFF8F0;
      --dark-text: #302D3A;
      --muted-text: #676375;
      --white: #FFFFFF;
      --soft-pink: #FFB7C5;

      /* Clay Shadows */
      --clay-card-shadow: 10px 14px 28px rgba(189, 160, 137, 0.22),
                          -10px -10px 24px rgba(255, 255, 255, 0.95),
                          inset 2px 2px 4px rgba(255, 255, 255, 0.6);
      --clay-btn-shadow: 6px 8px 16px rgba(255, 138, 91, 0.35),
                         -4px -4px 12px rgba(255, 255, 255, 0.8),
                         inset 2px 2px 3px rgba(255, 255, 255, 0.5);
      --clay-inset-shadow: inset 4px 4px 8px rgba(180, 155, 135, 0.22),
                           inset -4px -4px 8px rgba(255, 255, 255, 0.9);
      --radius-lg: 26px;
      --radius-md: 18px;
      --radius-sm: 12px;
      --transition-smooth: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html {
      scroll-behavior: smooth;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-cream);
      color: var(--dark-text);
      line-height: 1.6;
      overflow-x: hidden;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(255, 200, 87, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 90% 60%, rgba(140, 123, 255, 0.12) 0%, transparent 45%),
        radial-gradient(circle at 50% 90%, rgba(121, 220, 200, 0.12) 0%, transparent 50%);
      background-attachment: fixed;
    }

    h1, h2, h3, h4, .brand-font {
      font-family: 'Poppins', sans-serif;
      color: var(--dark-text);
      line-height: 1.25;
    }

    a {
      text-decoration: none;
      color: inherit;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
    }

    .container {
      width: 100%;
      max-width: 1240px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Clay Base Elements */
    .clay-card {
      background: var(--white);
      border-radius: var(--radius-lg);
      box-shadow: var(--clay-card-shadow);
      border: 2px solid rgba(255, 255, 255, 0.8);
      transition: var(--transition-smooth);
    }

    .clay-card:hover {
      transform: translateY(-6px);
      box-shadow: 12px 18px 34px rgba(189, 160, 137, 0.28),
                  -8px -8px 20px rgba(255, 255, 255, 0.95);
    }

    .clay-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 28px;
      border-radius: 40px;
      font-family: 'Poppins', sans-serif;
      font-weight: 600;
      font-size: 15px;
      cursor: pointer;
      border: none;
      outline: none;
      transition: var(--transition-smooth);
      box-shadow: var(--clay-btn-shadow);
    }

    .clay-btn-primary {
      background: linear-gradient(135deg, var(--primary) 0%, #ff6b33 100%);
      color: var(--white);
    }

    .clay-btn-primary:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 8px 12px 24px rgba(255, 138, 91, 0.45);
    }

    .clay-btn-secondary {
      background: var(--white);
      color: var(--dark-text);
      border: 2px solid #f3e5d8;
    }

    .clay-btn-secondary:hover {
      background: #faf4ee;
      transform: translateY(-3px);
    }

    .clay-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      border-radius: 30px;
      font-size: 13px;
      font-weight: 600;
      background: var(--white);
      box-shadow: 4px 6px 14px rgba(189, 160, 137, 0.15);
    }

    .badge-demo {
      font-size: 11px;
      background: #eee8f8;
      color: #6a49c2;
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
      display: inline-block;
      margin-left: 6px;
    }

    /* ===================================================
       STICKY NAVBAR
       =================================================== */
    header.sticky-header {
      position: sticky;
      top: 16px;
      z-index: 1000;
      padding: 0 20px;
      margin-bottom: 24px;
    }

    .navbar-clay {
      background: rgba(255, 255, 255, 0.88);
      backdrop-filter: blur(14px);
      border-radius: 36px;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px rgba(180, 150, 130, 0.15),
                  inset 0 1px 2px rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.7);
    }

    .brand-logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 22px;
      font-weight: 700;
      color: var(--dark-text);
    }

    .brand-logo i {
      color: var(--primary);
      background: #ffebe2;
      padding: 10px;
      border-radius: 50%;
      font-size: 18px;
    }

    .nav-links {
      display: flex;
      align-items: center;
      gap: 24px;
      list-style: none;
    }

    .nav-links a {
      font-weight: 500;
      font-size: 14px;
      color: var(--dark-text);
      transition: color 0.2s ease;
    }

    .nav-links a:hover {
      color: var(--primary);
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .hamburger-btn {
      display: none;
      background: none;
      border: none;
      font-size: 24px;
      color: var(--dark-text);
      cursor: pointer;
    }

    /* Mobile Nav Drawer */
    .mobile-nav-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      z-index: 1050;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    .mobile-nav-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .mobile-drawer {
      position: fixed;
      top: 0;
      right: -320px;
      width: 300px;
      height: 100%;
      background: var(--bg-cream);
      box-shadow: -8px 0 30px rgba(0, 0, 0, 0.15);
      z-index: 1100;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
      transition: right 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .mobile-drawer.open {
      right: 0;
    }

    .drawer-close {
      align-self: flex-end;
      background: none;
      border: none;
      font-size: 22px;
      cursor: pointer;
      color: var(--dark-text);
    }

    /* ===================================================
       HERO SECTION
       =================================================== */
    .hero-section {
      padding: 60px 0 80px;
      position: relative;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 48px;
      align-items: center;
    }

    .hero-tagline {
      display: inline-block;
      color: var(--primary);
      background: #ffede5;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 16px;
    }

    .hero-heading {
      font-size: 48px;
      font-weight: 800;
      margin-bottom: 20px;
      letter-spacing: -0.5px;
    }

    .hero-heading span {
      background: linear-gradient(135deg, var(--primary) 0%, #e65c00 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero-subtext {
      font-size: 17px;
      color: var(--muted-text);
      margin-bottom: 34px;
      max-width: 520px;
      line-height: 1.7;
    }

    .hero-cta-group {
      display: flex;
      align-items: center;
      gap: 18px;
      flex-wrap: wrap;
      margin-bottom: 40px;
    }

    .hero-stats {
      display: flex;
      gap: 28px;
      padding-top: 24px;
      border-top: 2px dashed rgba(189, 160, 137, 0.25);
    }

    .stat-item h3 {
      font-size: 26px;
      font-weight: 700;
      color: var(--primary);
    }

    .stat-item p {
      font-size: 13px;
      color: var(--muted-text);
      font-weight: 500;
    }

    .hero-visual {
      position: relative;
    }

    .hero-image-wrapper {
      position: relative;
      border-radius: 36px;
      overflow: hidden;
      box-shadow: 16px 24px 40px rgba(189, 160, 137, 0.3),
                  inset 4px 4px 10px rgba(255, 255, 255, 0.7);
      border: 4px solid var(--white);
    }

    .hero-image-wrapper img {
      width: 100%;
      height: 460px;
      object-fit: cover;
    }

    /* Floating Badges */
    .floating-card-rating {
      position: absolute;
      top: -18px;
      right: -16px;
      background: var(--white);
      padding: 12px 20px;
      border-radius: 20px;
      box-shadow: 0 12px 25px rgba(0, 0, 0, 0.12);
      display: flex;
      align-items: center;
      gap: 12px;
      border: 2px solid #fff3eb;
      animation: floatSlow 4s ease-in-out infinite alternate;
    }

    .floating-card-experience {
      position: absolute;
      bottom: -22px;
      left: -20px;
      background: var(--white);
      padding: 14px 22px;
      border-radius: 24px;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
      display: flex;
      align-items: center;
      gap: 14px;
      border: 2px solid #fff3eb;
      animation: floatSlow 4.5s ease-in-out infinite alternate-reverse;
    }

    @keyframes floatSlow {
      0% { transform: translateY(0); }
      100% { transform: translateY(-10px); }
    }

    /* ===================================================
       SECTION COMMONS
       =================================================== */
    section {
      padding: 80px 0;
    }

    .section-header {
      text-align: center;
      max-width: 650px;
      margin: 0 auto 56px;
    }

    .section-subtitle {
      color: var(--primary);
      text-transform: uppercase;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1px;
      display: inline-block;
      margin-bottom: 10px;
    }

    .section-title {
      font-size: 36px;
      font-weight: 800;
      margin-bottom: 14px;
    }

    .section-description {
      color: var(--muted-text);
      font-size: 16px;
    }

    /* ===================================================
       SERVICES SECTION
       =================================================== */
    .services-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 28px;
    }

    .service-card {
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .service-card-img-wrapper {
      position: relative;
      height: 190px;
      overflow: hidden;
      border-radius: 22px 22px 0 0;
    }

    .service-card-img-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.5s ease;
    }

    .service-card:hover .service-card-img-wrapper img {
      transform: scale(1.08);
    }

    .service-badge-category {
      position: absolute;
      top: 14px;
      left: 14px;
      background: rgba(255, 255, 255, 0.9);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      color: var(--dark-text);
      backdrop-filter: blur(4px);
    }

    .service-card-body {
      padding: 22px;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
    }

    .service-card-title {
      font-size: 19px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .service-card-desc {
      font-size: 14px;
      color: var(--muted-text);
      margin-bottom: 16px;
      flex-grow: 1;
    }

    .service-card-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid #f3e8df;
      padding-top: 16px;
    }

    .service-price-block small {
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      color: var(--muted-text);
    }

    .service-price-block strong {
      font-size: 20px;
      color: var(--primary);
    }

    /* ===================================================
       HOW IT WORKS
       =================================================== */
    .steps-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 24px;
      position: relative;
    }

    .step-card {
      padding: 32px 24px;
      text-align: center;
      position: relative;
    }

    .step-number {
      width: 60px;
      height: 60px;
      margin: 0 auto 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 800;
      color: var(--white);
      box-shadow: 4px 6px 16px rgba(0, 0, 0, 0.12);
    }

    .step-1 { background: linear-gradient(135deg, var(--primary), #e65c00); }
    .step-2 { background: linear-gradient(135deg, var(--secondary), #d99b1a); }
    .step-3 { background: linear-gradient(135deg, var(--accent), #6854e6); }
    .step-4 { background: linear-gradient(135deg, var(--mint), #3ba38d); }

    /* ===================================================
       TEAM SECTION
       =================================================== */
    .team-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 28px;
    }

    .team-card {
      padding: 24px;
      text-align: center;
    }

    .team-avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      margin: 0 auto 16px;
      overflow: hidden;
      border: 4px solid var(--white);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    }

    .team-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .team-skills-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin: 14px 0 20px;
    }

    .skill-chip {
      background: #f4ecff;
      color: #6346b0;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 500;
    }

    /* ===================================================
       GALLERY & LIGHTBOX
       =================================================== */
    .gallery-filter-buttons {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 36px;
    }

    .gallery-filter-btn {
      padding: 8px 20px;
      border-radius: 20px;
      background: var(--white);
      border: 1px solid #ebdcd0;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition-smooth);
    }

    .gallery-filter-btn.active, .gallery-filter-btn:hover {
      background: var(--primary);
      color: var(--white);
      border-color: var(--primary);
      box-shadow: var(--clay-btn-shadow);
    }

    .gallery-masonry {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }

    .gallery-card {
      position: relative;
      border-radius: 22px;
      overflow: hidden;
      cursor: pointer;
      height: 270px;
      box-shadow: var(--clay-card-shadow);
    }

    .gallery-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }

    .gallery-card-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(48, 45, 58, 0.85) 0%, transparent 60%);
      opacity: 0;
      transition: opacity 0.3s ease;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding: 20px;
      color: var(--white);
    }

    .gallery-card:hover .gallery-card-overlay {
      opacity: 1;
    }

    .gallery-card:hover img {
      transform: scale(1.05);
    }

    /* Lightbox Modal */
    .lightbox-modal {
      position: fixed;
      inset: 0;
      background: rgba(18, 16, 26, 0.85);
      backdrop-filter: blur(8px);
      z-index: 2000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .lightbox-modal.active {
      display: flex;
    }

    .lightbox-content {
      max-width: 850px;
      width: 100%;
      background: var(--white);
      border-radius: 26px;
      overflow: hidden;
      position: relative;
    }

    .lightbox-content img {
      width: 100%;
      max-height: 520px;
      object-fit: cover;
    }

    .lightbox-details {
      padding: 24px;
    }

    .lightbox-close {
      position: absolute;
      top: 16px;
      right: 16px;
      background: var(--white);
      border: none;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    /* ===================================================
       TRACK YOUR BOOKING SECTION
       =================================================== */
    .track-section-card {
      background: linear-gradient(135deg, #ffffff 0%, #fff6ef 100%);
      padding: 44px;
      border-radius: 32px;
      box-shadow: var(--clay-card-shadow);
      max-width: 820px;
      margin: 0 auto;
    }

    .track-form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 16px;
      align-items: flex-end;
    }

    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--dark-text);
    }

    .clay-input {
      width: 100%;
      padding: 14px 18px;
      border-radius: 14px;
      border: 1.5px solid #eeddd1;
      background: #faf4ef;
      box-shadow: var(--clay-inset-shadow);
      font-size: 14px;
      outline: none;
      font-family: inherit;
      color: var(--dark-text);
      transition: border-color 0.2s ease;
    }

    .clay-input:focus {
      border-color: var(--primary);
      background: #ffffff;
    }

    /* Visual Tracking Progress Bar */
    .tracking-result-box {
      margin-top: 36px;
      padding: 28px;
      border-radius: 24px;
      background: var(--white);
      box-shadow: var(--clay-card-shadow);
      display: none;
    }

    .status-tracker-rail {
      display: flex;
      justify-content: space-between;
      position: relative;
      margin: 36px 0 20px;
    }

    .status-tracker-rail::before {
      content: '';
      position: absolute;
      top: 18px;
      left: 20px;
      right: 20px;
      height: 4px;
      background: #eadace;
      z-index: 1;
    }

    .tracker-node {
      position: relative;
      z-index: 2;
      text-align: center;
      width: 80px;
    }

    .node-icon {
      width: 38px;
      height: 38px;
      margin: 0 auto 8px;
      background: #eadace;
      color: #938981;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      border: 3px solid var(--white);
    }

    .tracker-node.completed .node-icon {
      background: var(--mint);
      color: var(--white);
    }

    .tracker-node.active .node-icon {
      background: var(--primary);
      color: var(--white);
      box-shadow: 0 0 0 4px rgba(255, 138, 91, 0.25);
    }

    .tracker-node p {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted-text);
    }

    .tracker-node.active p, .tracker-node.completed p {
      color: var(--dark-text);
    }

    /* ===================================================
       MULTI-STEP BOOKING MODAL
       =================================================== */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(18, 16, 26, 0.7);
      backdrop-filter: blur(8px);
      z-index: 3000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal-container {
      background: var(--bg-cream);
      width: 100%;
      max-width: 880px;
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 32px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
      padding: 36px;
      position: relative;
      border: 3px solid var(--white);
    }

    .modal-close-btn {
      position: absolute;
      top: 24px;
      right: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--white);
      border: none;
      box-shadow: 0 4px 10px rgba(0,0,0,0.1);
      cursor: pointer;
      font-size: 18px;
    }

    .wizard-steps-indicator {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
      border-bottom: 2px dashed #e2d1c3;
      padding-bottom: 20px;
    }

    .wizard-step-bullet {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 600;
      color: var(--muted-text);
    }

    .wizard-step-bullet.active {
      color: var(--primary);
    }

    .wizard-step-bullet.done {
      color: #3ba38d;
    }

    .wizard-step-num {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #e3d2c4;
      color: var(--white);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .wizard-step-bullet.active .wizard-step-num {
      background: var(--primary);
    }

    .wizard-step-bullet.done .wizard-step-num {
      background: var(--mint);
    }

    .wizard-step-panel {
      display: none;
    }

    .wizard-step-panel.active {
      display: block;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .services-select-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 16px;
      margin: 20px 0;
      max-height: 380px;
      overflow-y: auto;
      padding: 4px;
    }

    .service-select-item {
      padding: 16px;
      border-radius: 18px;
      background: var(--white);
      box-shadow: var(--clay-card-shadow);
      border: 2px solid transparent;
      cursor: pointer;
      transition: var(--transition-smooth);
    }

    .service-select-item.selected {
      border-color: var(--primary);
      background: #fff4ee;
    }

    .time-slot-picker {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin: 16px 0;
    }

    .time-slot-btn {
      padding: 16px;
      text-align: center;
      border-radius: 16px;
      background: var(--white);
      border: 2px solid #ecdcd1;
      cursor: pointer;
      font-weight: 600;
    }

    .time-slot-btn.selected {
      border-color: var(--primary);
      background: #fff4ee;
      color: var(--primary);
    }

    .summary-card-box {
      background: var(--white);
      border-radius: 20px;
      padding: 24px;
      box-shadow: var(--clay-card-shadow);
      margin: 20px 0;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dashed #eeded0;
      font-size: 14px;
    }

    .summary-row.total {
      font-size: 18px;
      font-weight: 700;
      color: var(--primary);
      border-bottom: none;
      padding-top: 16px;
    }

    .wizard-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 28px;
    }

    /* Success confirmation view */
    .booking-success-box {
      text-align: center;
      padding: 30px 10px;
      display: none;
    }

    .success-icon-burst {
      width: 80px;
      height: 80px;
      background: var(--mint);
      color: var(--white);
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      box-shadow: 0 10px 24px rgba(121, 220, 200, 0.4);
    }

    .booking-id-pill {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      background: #fdf1e8;
      border: 2px dashed var(--primary);
      padding: 12px 24px;
      border-radius: 30px;
      font-size: 18px;
      font-weight: 700;
      color: var(--primary);
      margin: 16px 0;
    }

    /* ===================================================
       FOOTER
       =================================================== */
    footer.main-footer {
      background: #272430;
      color: #dfdbe8;
      padding: 70px 0 30px;
      margin-top: 80px;
      border-radius: 40px 40px 0 0;
    }

    .footer-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1.5fr;
      gap: 40px;
      margin-bottom: 50px;
    }

    .footer-col h4 {
      color: var(--white);
      margin-bottom: 20px;
      font-size: 18px;
    }

    .footer-links {
      list-style: none;
    }

    .footer-links li {
      margin-bottom: 12px;
    }

    .footer-links a {
      color: #b5afc4;
      font-size: 14px;
      transition: color 0.2s ease;
    }

    .footer-links a:hover {
      color: var(--secondary);
    }

    .footer-bottom {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: #928ca1;
    }

    /* Responsive */
    @media (max-width: 992px) {
      .hero-grid { grid-template-columns: 1fr; text-align: center; }
      .hero-cta-group, .hero-stats { justify-content: center; }
      .hero-subtext { margin-left: auto; margin-right: auto; }
      .steps-grid { grid-template-columns: repeat(2, 1fr); }
      .footer-grid { grid-template-columns: 1fr 1fr; }
      .nav-links { display: none; }
      .hamburger-btn { display: block; }
    }

    @media (max-width: 640px) {
      .steps-grid, .footer-grid, .track-form-grid, .time-slot-picker { grid-template-columns: 1fr; }
      .hero-heading { font-size: 34px; }
      .hero-image-wrapper img { height: 320px; }
      .floating-card-rating, .floating-card-experience { display: none; }
      .modal-container { padding: 22px; }
      .wizard-step-bullet span { display: none; }
    }
  </style>
</head>
<body>

  <!-- Sticky Navbar -->
  <header class="sticky-header">
    <div class="container">
      <nav class="navbar-clay">
        <a href="/" class="brand-logo">
          <i class="fa-solid fa-hammer"></i>
          <span>${safeSettings.businessName}</span>
        </a>
        <ul class="nav-links">
          <li><a href="#services">Services</a></li>
          <li><a href="#how-it-works">How It Works</a></li>
          <li><a href="#team">Our Team</a></li>
          <li><a href="#gallery">Gallery</a></li>
          <li><a href="#track">Track Booking</a></li>
          <li><a href="#reviews">Reviews</a></li>
          <li><a href="#contact">Contact</a></li>
          <li><a href="/admin" target="_blank" style="color: var(--accent); font-weight: 600;"><i class="fa-solid fa-lock"></i> Admin</a></li>
        </ul>
        <div class="nav-actions">
          <button class="clay-btn clay-btn-primary" onclick="openBookingWizard()">
            <i class="fa-solid fa-calendar-check"></i> Book a Service
          </button>
          <button class="hamburger-btn" onclick="toggleMobileNav()"><i class="fa-solid fa-bars"></i></button>
        </div>
      </nav>
    </div>
  </header>

  <!-- Mobile Drawer -->
  <div class="mobile-nav-overlay" id="mobileNavOverlay" onclick="toggleMobileNav()"></div>
  <aside class="mobile-drawer" id="mobileDrawer">
    <button class="drawer-close" onclick="toggleMobileNav()"><i class="fa-solid fa-xmark"></i></button>
    <div class="brand-logo" style="margin-bottom: 10px;">
      <i class="fa-solid fa-hammer"></i>
      <span>${safeSettings.businessName}</span>
    </div>
    <a href="#services" onclick="toggleMobileNav()">Services</a>
    <a href="#how-it-works" onclick="toggleMobileNav()">How It Works</a>
    <a href="#team" onclick="toggleMobileNav()">Our Team</a>
    <a href="#gallery" onclick="toggleMobileNav()">Gallery</a>
    <a href="#track" onclick="toggleMobileNav()">Track Booking</a>
    <a href="#reviews" onclick="toggleMobileNav()">Customer Reviews</a>
    <a href="#contact" onclick="toggleMobileNav()">Contact Us</a>
    <a href="/admin" target="_blank" onclick="toggleMobileNav()" style="color: var(--accent); font-weight:700;"><i class="fa-solid fa-lock"></i> Admin Portal</a>
    <button class="clay-btn clay-btn-primary" onclick="toggleMobileNav(); openBookingWizard();" style="margin-top: auto;">
      Book a Carpenter
    </button>
  </aside>

  <!-- HERO SECTION -->
  <section class="hero-section">
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <span class="hero-tagline"><i class="fa-solid fa-award"></i> Master Quality Woodcraft</span>
          <h1 class="hero-heading">
            Beautiful Woodwork.<br>
            <span>Expert Hands.</span><br>
            Happier Homes.
          </h1>
          <p class="hero-subtext">
            From custom furniture and luxury modular kitchens to daily household repairs, our certified carpenters bring your vision to life with precision and care.
          </p>
          <div class="hero-cta-group">
            <button class="clay-btn clay-btn-primary" onclick="openBookingWizard()">
              <i class="fa-solid fa-tools"></i> Book a Carpenter
            </button>
            <a href="#services" class="clay-btn clay-btn-secondary">
              Explore Our Services
            </a>
          </div>
          <div class="hero-stats">
            <div class="stat-item">
              <h3>${safeSettings.statsProjects}</h3>
              <p>Projects Done <span class="badge-demo">Demo</span></p>
            </div>
            <div class="stat-item">
              <h3>${safeSettings.statsCarpenters}</h3>
              <p>Certified Carpenters</p>
            </div>
            <div class="stat-item">
              <h3>${safeSettings.statsRating}</h3>
              <p>Customer Rating</p>
            </div>
            <div class="stat-item">
              <h3>${safeSettings.statsExperience}</h3>
              <p>Trusted Craft</p>
            </div>
          </div>
        </div>

        <div class="hero-visual">
          <div class="hero-image-wrapper">
            <img src="https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80" alt="Woodworking Master Craftsmanship">
          </div>
          <div class="floating-card-rating">
            <i class="fa-solid fa-star" style="color: #ffb703; font-size: 22px;"></i>
            <div>
              <strong style="display:block; font-size:15px;">4.95 Rating</strong>
              <small style="color:var(--muted-text); font-size: 11px;">1,200+ Happy Homes</small>
            </div>
          </div>
          <div class="floating-card-experience">
            <i class="fa-solid fa-shield-halved" style="color: var(--mint); font-size: 26px;"></i>
            <div>
              <strong style="display:block; font-size:15px;">100% Work Guarantee</strong>
              <small style="color:var(--muted-text); font-size: 11px;">Verified & Insured Pros</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- SERVICES SECTION -->
  <section id="services">
    <div class="container">
      <div class="section-header">
        <span class="section-subtitle">Our Specializations</span>
        <h2 class="section-title">Carpentry Services We Excel In</h2>
        <p class="section-description">Transparent base rates. Final cost confirmed only after on-site inspection or detailed project scope assessment.</p>
      </div>

      <div class="services-grid">
        ${services.map(s => `
          <div class="clay-card service-card">
            <div class="service-card-img-wrapper">
              <span class="service-badge-category">${s.category}</span>
              <img src="${s.imageUrl}" alt="${s.name}" loading="lazy">
            </div>
            <div class="service-card-body">
              <h3 class="service-card-title">${s.name}</h3>
              <p class="service-card-desc">${s.description}</p>
              <div style="font-size: 12px; color: var(--muted-text); margin-bottom: 12px;">
                <i class="fa-regular fa-clock"></i> Est. Duration: ${s.duration}
              </div>
              <div class="service-card-footer">
                <div class="service-price-block">
                  <small>Starting At</small>
                  <strong>₹${s.startingPrice.toLocaleString('en-IN')}</strong>
                </div>
                <button class="clay-btn clay-btn-primary" style="padding: 8px 18px; font-size: 13px;" onclick="openBookingWizard('${s._id}')">
                  Book Now
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- HOW IT WORKS -->
  <section id="how-it-works" style="background: rgba(255, 255, 255, 0.5);">
    <div class="container">
      <div class="section-header">
        <span class="section-subtitle">Effortless Process</span>
        <h2 class="section-title">How WoodCraft Pro Works</h2>
        <p class="section-description">Get your home woodwork repaired or built in 4 easy steps.</p>
      </div>
      <div class="steps-grid">
        <div class="clay-card step-card">
          <div class="step-number step-1">1</div>
          <h3 style="font-size: 18px; margin-bottom: 10px;">Choose Services</h3>
          <p style="font-size: 14px; color: var(--muted-text);">Select from our wide range of carpentry solutions and select your preferred schedule.</p>
        </div>
        <div class="clay-card step-card">
          <div class="step-number step-2">2</div>
          <h3 style="font-size: 18px; margin-bottom: 10px;">Submit Request</h3>
          <p style="font-size: 14px; color: var(--muted-text);">Upload reference photos, describe your job, and receive an instant booking code.</p>
        </div>
        <div class="clay-card step-card">
          <div class="step-number step-3">3</div>
          <h3 style="font-size: 18px; margin-bottom: 10px;">Meet Your Pro</h3>
          <p style="font-size: 14px; color: var(--muted-text);">A vetted carpenter arrives on time with precision tools to evaluate and start the job.</p>
        </div>
        <div class="clay-card step-card">
          <div class="step-number step-4">4</div>
          <h3 style="font-size: 18px; margin-bottom: 10px;">Enjoy Quality Work</h3>
          <p style="font-size: 14px; color: var(--muted-text);">Pay conveniently after the job is completed to your 100% satisfaction.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- TRACK YOUR BOOKING -->
  <section id="track">
    <div class="container">
      <div class="track-section-card">
        <div style="text-align: center; margin-bottom: 24px;">
          <span class="clay-pill" style="margin-bottom: 12px; color: var(--primary);"><i class="fa-solid fa-satellite-dish"></i> Live Project Tracker</span>
          <h2 style="font-size: 28px;">Track Your Carpentry Service</h2>
          <p style="font-size: 14px; color: var(--muted-text);">Enter your unique Booking ID and registered phone number to see live progress.</p>
        </div>

        <form id="trackForm" onsubmit="handleTrackBooking(event)">
          <div class="track-form-grid">
            <div class="form-group">
              <label for="trackBookingId">Booking ID</label>
              <input type="text" id="trackBookingId" class="clay-input" placeholder="e.g. WCP-2026-00001" required>
            </div>
            <div class="form-group">
              <label for="trackPhone">Registered Mobile</label>
              <input type="tel" id="trackPhone" class="clay-input" placeholder="10-digit number" required>
            </div>
            <button type="submit" class="clay-btn clay-btn-primary" style="height: 48px;">
              <i class="fa-solid fa-magnifying-glass"></i> Track Status
            </button>
          </div>
        </form>

        <div id="trackResultBox" class="tracking-result-box"></div>
      </div>
    </div>
  </section>

  <!-- OUR TEAM -->
  <section id="team">
    <div class="container">
      <div class="section-header">
        <span class="section-subtitle">Skilled Craftsmen</span>
        <h2 class="section-title">Meet Our Master Carpenters</h2>
        <p class="section-description">Background-checked, experienced, and dedicated to delivering flawless craftsmanship.</p>
      </div>

      <div class="team-grid">
        ${carpenters.map(c => `
          <div class="clay-card team-card">
            <div class="team-avatar">
              <img src="${c.photoUrl}" alt="${c.name}" loading="lazy">
            </div>
            <h3 style="font-size: 19px; margin-bottom: 4px;">${c.name}</h3>
            <p style="color: var(--primary); font-size: 13px; font-weight: 600;">${c.specialization}</p>
            <div style="font-size: 13px; color: var(--muted-text); margin: 6px 0;">
              <strong>${c.experienceYears} Years</strong> Experience • <i class="fa-solid fa-star" style="color:#ffb703;"></i> ${c.rating}
            </div>
            <div class="team-skills-chips">
              ${c.skills.map(s => `<span class="skill-chip">${s}</span>`).join('')}
            </div>
            <button class="clay-btn clay-btn-secondary" style="width: 100%; font-size: 13px; padding: 10px;" onclick="openBookingWizard(null, '${c._id}')">
              Book This Carpenter
            </button>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- GALLERY SECTION -->
  <section id="gallery">
    <div class="container">
      <div class="section-header">
        <span class="section-subtitle">Real Craftsmanship</span>
        <h2 class="section-title">Finished Projects Gallery</h2>
        <p class="section-description">Explore a curated showcase of our bespoke woodwork, renovations, and custom installations.</p>
      </div>

      <div class="gallery-filter-buttons">
        <button class="gallery-filter-btn active" onclick="filterGallery('All', this)">All Projects</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Furniture', this)">Furniture</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Wardrobes', this)">Wardrobes</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Kitchens', this)">Kitchens</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Doors', this)">Doors</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Interiors', this)">Interiors</button>
        <button class="gallery-filter-btn" onclick="filterGallery('Repairs', this)">Repairs</button>
      </div>

      <div class="gallery-masonry" id="galleryContainer">
        ${gallery.map(item => `
          <div class="gallery-card" data-category="${item.category}" onclick="openLightbox('${item.imageUrl}', '${item.title.replace(/'/g, "\\'")}', '${item.category}', '${item.description.replace(/'/g, "\\'")}')">
            <img src="${item.imageUrl}" alt="${item.title}" loading="lazy">
            <div class="gallery-card-overlay">
              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.9;">${item.category}</span>
              <h4 style="font-size: 17px; margin-top: 4px;">${item.title}</h4>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CUSTOMER REVIEWS -->
  <section id="reviews" style="background: rgba(255, 255, 255, 0.4);">
    <div class="container">
      <div class="section-header">
        <span class="section-subtitle">Client Endorsements</span>
        <h2 class="section-title">What Our Customers Say</h2>
        <p class="section-description">Authentic feedback from homeowners across our service areas. <span class="badge-demo">Demonstration Content</span></p>
      </div>

      <div class="services-grid">
        ${reviews.map(r => `
          <div class="clay-card" style="padding: 28px; display: flex; flex-direction: column;">
            <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px;">
              <img src="${r.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=120&q=80'}" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover;" alt="${r.customerName}">
              <div>
                <strong style="display: block; font-size: 15px;">${r.customerName}</strong>
                <small style="color: var(--muted-text); font-size: 12px;">Service: ${r.serviceCompleted}</small>
              </div>
            </div>
            <div style="color: #ffb703; margin-bottom: 12px; font-size: 14px;">
              ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}
            </div>
            <p style="font-size: 14px; color: var(--dark-text); font-style: italic; flex-grow: 1;">"${r.review}"</p>
          </div>
        `).join('')}
      </div>
    </div>
  </section>

  <!-- CONTACT & ABOUT -->
  <section id="contact">
    <div class="container">
      <div class="clay-card" style="padding: 48px; border-radius: 36px; background: #ffffff;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 48px;">
          <div>
            <span class="section-subtitle">Get In Touch</span>
            <h2 style="font-size: 32px; margin-bottom: 16px;">Ready to Upgrade Your Living Spaces?</h2>
            <p style="color: var(--muted-text); margin-bottom: 28px; font-size: 15px;">
              Whether it is fixing a squeaky door or designing an architect-grade modular kitchen, our master carpenters are ready to assist.
            </p>

            <div style="display: flex; flex-direction: column; gap: 18px; margin-bottom: 32px;">
              <div style="display: flex; align-items: center; gap: 14px;">
                <i class="fa-solid fa-phone" style="width: 38px; height: 38px; border-radius: 50%; background: #fff0e7; color: var(--primary); display: flex; align-items: center; justify-content: center;"></i>
                <div>
                  <small style="display: block; color: var(--muted-text); font-size: 11px;">Direct Call</small>
                  <strong>${safeSettings.phone}</strong> <span class="badge-demo">Demo</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 14px;">
                <i class="fa-brands fa-whatsapp" style="width: 38px; height: 38px; border-radius: 50%; background: #eafaf1; color: #25d366; display: flex; align-items: center; justify-content: center;"></i>
                <div>
                  <small style="display: block; color: var(--muted-text); font-size: 11px;">WhatsApp Chat</small>
                  <strong>${safeSettings.whatsapp}</strong>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 14px;">
                <i class="fa-solid fa-location-dot" style="width: 38px; height: 38px; border-radius: 50%; background: #f1edff; color: var(--accent); display: flex; align-items: center; justify-content: center;"></i>
                <div>
                  <small style="display: block; color: var(--muted-text); font-size: 11px;">Workshop Address</small>
                  <strong>${safeSettings.address}</strong>
                </div>
              </div>
            </div>
          </div>

          <div>
            <form id="publicContactForm" onsubmit="handleContactSubmit(event)" style="display: flex; flex-direction: column; gap: 16px;">
              <div>
                <label style="font-size: 13px; font-weight: 600;">Your Full Name</label>
                <input type="text" id="contactName" class="clay-input" placeholder="e.g. Anand Sen" required>
              </div>
              <div>
                <label style="font-size: 13px; font-weight: 600;">Mobile Number</label>
                <input type="tel" id="contactPhone" class="clay-input" placeholder="+91 98765 43210" required>
              </div>
              <div>
                <label style="font-size: 13px; font-weight: 600;">Project Scope / Message</label>
                <textarea id="contactMessage" class="clay-input" rows="4" placeholder="Describe the woodwork or repairs required..."></textarea>
              </div>
              <button type="submit" class="clay-btn clay-btn-primary" style="width: 100%;">
                <i class="fa-solid fa-paper-plane"></i> Send Request
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- MAIN FOOTER -->
  <footer class="main-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-col">
          <div class="brand-logo" style="color: var(--white); margin-bottom: 16px;">
            <i class="fa-solid fa-hammer" style="color: var(--primary);"></i>
            <span>${safeSettings.businessName}</span>
          </div>
          <p style="font-size: 14px; max-width: 340px; margin-bottom: 20px;">
            ${safeSettings.tagline} Delivering durable, precision-engineered residential woodwork, custom furniture, and commercial repairs.
          </p>
          <div style="display: flex; gap: 12px;">
            <a href="#" style="width: 36px; height: 36px; border-radius: 50%; background: #3b3748; display: flex; align-items: center; justify-content: center; color: var(--white);"><i class="fa-brands fa-facebook-f"></i></a>
            <a href="#" style="width: 36px; height: 36px; border-radius: 50%; background: #3b3748; display: flex; align-items: center; justify-content: center; color: var(--white);"><i class="fa-brands fa-instagram"></i></a>
            <a href="#" style="width: 36px; height: 36px; border-radius: 50%; background: #3b3748; display: flex; align-items: center; justify-content: center; color: var(--white);"><i class="fa-brands fa-youtube"></i></a>
          </div>
        </div>

        <div class="footer-col">
          <h4>Explore</h4>
          <ul class="footer-links">
            <li><a href="#services">Our Services</a></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#team">Certified Carpenters</a></li>
            <li><a href="#gallery">Project Portfolio</a></li>
            <li><a href="#track">Live Order Tracker</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Services</h4>
          <ul class="footer-links">
            <li><a href="#services">Furniture Repair</a></li>
            <li><a href="#services">Modular Kitchens</a></li>
            <li><a href="#services">Wardrobe Fitting</a></li>
            <li><a href="#services">Wooden Flooring</a></li>
            <li><a href="#services">Lock & Door Repair</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>Official Admin</h4>
          <p style="font-size: 13px; margin-bottom: 14px;">Authorized WoodCraft Pro crew and managers access the real-time operational dashboard here.</p>
          <a href="/admin" target="_blank" class="clay-btn clay-btn-secondary" style="font-size: 13px; padding: 8px 18px; color: var(--dark-text); background: var(--white);">
            <i class="fa-solid fa-lock"></i> Open Admin Portal
          </a>
        </div>
      </div>

      <div class="footer-bottom">
        <div>&copy; 2026 ${safeSettings.businessName}. All rights reserved. Configurable business platform.</div>
        <div style="display: flex; gap: 20px;">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Safety Guarantee</a>
        </div>
      </div>
    </div>
  </footer>

  <!-- LIGHTBOX MODAL -->
  <div class="lightbox-modal" id="lightboxModal" onclick="closeLightbox(event)">
    <div class="lightbox-content" onclick="event.stopPropagation()">
      <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
      <img id="lightboxImg" src="" alt="Project Preview">
      <div class="lightbox-details">
        <span id="lightboxCategory" class="clay-pill" style="margin-bottom: 8px;"></span>
        <h3 id="lightboxTitle" style="font-size: 22px; margin-bottom: 8px;"></h3>
        <p id="lightboxDesc" style="color: var(--muted-text); font-size: 14px;"></p>
      </div>
    </div>
  </div>

  <!-- MULTI-STEP BOOKING WIZARD MODAL -->
  <div class="modal-overlay" id="bookingModal">
    <div class="modal-container">
      <button class="modal-close-btn" onclick="closeBookingWizard()">&times;</button>
      
      <div class="wizard-steps-indicator">
        <div class="wizard-step-bullet active" id="stepIndicator1"><div class="wizard-step-num">1</div> <span>Services</span></div>
        <div class="wizard-step-bullet" id="stepIndicator2"><div class="wizard-step-num">2</div> <span>Your Info</span></div>
        <div class="wizard-step-bullet" id="stepIndicator3"><div class="wizard-step-num">3</div> <span>Project</span></div>
        <div class="wizard-step-bullet" id="stepIndicator4"><div class="wizard-step-num">4</div> <span>Schedule</span></div>
        <div class="wizard-step-bullet" id="stepIndicator5"><div class="wizard-step-num">5</div> <span>Summary</span></div>
      </div>

      <form id="bookingWizardForm" onsubmit="handleBookingSubmit(event)">
        <!-- Step 1: Select Services -->
        <div class="wizard-step-panel active" id="wizardPanel1">
          <h3 style="font-size: 22px; margin-bottom: 6px;">Select Carpentry Services</h3>
          <p style="color: var(--muted-text); font-size: 14px;">Select one or more services you require for this appointment.</p>
          
          <div class="services-select-list">
            ${services.map(s => `
              <div class="service-select-item" onclick="toggleServiceSelection('${s._id}', '${s.name.replace(/'/g, "\\'")}', ${s.startingPrice}, this)">
                <div style="font-weight: 700; font-size: 15px; margin-bottom: 6px;">${s.name}</div>
                <div style="font-size: 12px; color: var(--muted-text); margin-bottom: 8px;">${s.category} • ${s.duration}</div>
                <div style="color: var(--primary); font-weight: 700;">From ₹${s.startingPrice}</div>
              </div>
            `).join('')}
          </div>

          <div class="wizard-actions">
            <div></div>
            <button type="button" class="clay-btn clay-btn-primary" onclick="goToStep(2)">Next: Your Details &rarr;</button>
          </div>
        </div>

        <!-- Step 2: Customer Information -->
        <div class="wizard-step-panel" id="wizardPanel2">
          <h3 style="font-size: 22px; margin-bottom: 6px;">Customer & Location Details</h3>
          <p style="color: var(--muted-text); font-size: 14px;">Where should our carpenter report for the inspection or service?</p>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 18px;">
            <div>
              <label class="form-group">Full Name *</label>
              <input type="text" id="custName" class="clay-input" placeholder="e.g. Neha Sharma" required>
            </div>
            <div>
              <label class="form-group">Mobile Number *</label>
              <input type="tel" id="custPhone" class="clay-input" placeholder="10-digit phone number" required>
            </div>
            <div style="grid-column: span 2;">
              <label class="form-group">Email Address *</label>
              <input type="email" id="custEmail" class="clay-input" placeholder="neha@example.com" required>
            </div>
            <div style="grid-column: span 2;">
              <label class="form-group">Complete Street Address *</label>
              <input type="text" id="custAddress" class="clay-input" placeholder="Flat No., Building Name, Street / Landmark" required>
            </div>
            <div>
              <label class="form-group">City *</label>
              <input type="text" id="custCity" class="clay-input" value="Prayagraj" required>
            </div>
            <div>
              <label class="form-group">Area / Locality</label>
              <input type="text" id="custArea" class="clay-input" placeholder="e.g. Civil Lines">
            </div>
            <div>
              <label class="form-group">PIN Code *</label>
              <input type="text" id="custPincode" class="clay-input" placeholder="211001" required>
            </div>
          </div>

          <div class="wizard-actions">
            <button type="button" class="clay-btn clay-btn-secondary" onclick="goToStep(1)">&larr; Back</button>
            <button type="button" class="clay-btn clay-btn-primary" onclick="goToStep(3)">Next: Project Details &rarr;</button>
          </div>
        </div>

        <!-- Step 3: Project Details -->
        <div class="wizard-step-panel" id="wizardPanel3">
          <h3 style="font-size: 22px; margin-bottom: 6px;">Project Scope & Specifications</h3>
          <p style="color: var(--muted-text); font-size: 14px;">Help us understand what needs fixing, restoring, or crafting.</p>
          
          <div style="display: flex; flex-direction: column; gap: 16px; margin-top: 18px;">
            <div>
              <label class="form-group">Project Title / Summary *</label>
              <input type="text" id="projTitle" class="clay-input" placeholder="e.g. Fix 2 Wardrobe doors & Kitchen drawer" required>
            </div>
            <div>
              <label class="form-group">Detailed Description</label>
              <textarea id="projDesc" class="clay-input" rows="3" placeholder="Describe wood type, squeaks, dimensions, or specific replacement hardware..."></textarea>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              <div>
                <label class="form-group">Type of Work</label>
                <select id="projType" class="clay-input">
                  <option value="Repair & Restoration">Repair & Restoration</option>
                  <option value="New Custom Build">New Custom Build</option>
                  <option value="Installation / Assembly">Installation / Assembly</option>
                  <option value="Complete Renovation">Complete Renovation</option>
                </select>
              </div>
              <div>
                <label class="form-group">Preferred Carpenter (Optional)</label>
                <select id="projCarpenter" class="clay-input">
                  <option value="">Any Available Certified Master</option>
                  ${carpenters.map(c => `<option value="${c._id}">${c.name} (${c.specialization})</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="form-group">Estimated Budget (₹ INR)</label>
              <input type="number" id="projBudget" class="clay-input" placeholder="e.g. 1500">
            </div>
            <div>
              <label class="form-group">Upload Reference Photos (Optional, up to 4 images)</label>
              <input type="file" id="projImages" class="clay-input" multiple accept="image/*">
            </div>
          </div>

          <div class="wizard-actions">
            <button type="button" class="clay-btn clay-btn-secondary" onclick="goToStep(2)">&larr; Back</button>
            <button type="button" class="clay-btn clay-btn-primary" onclick="goToStep(4)">Next: Select Schedule &rarr;</button>
          </div>
        </div>

        <!-- Step 4: Schedule -->
        <div class="wizard-step-panel" id="wizardPanel4">
          <h3 style="font-size: 22px; margin-bottom: 6px;">Select Date & Preferred Time Slot</h3>
          <p style="color: var(--muted-text); font-size: 14px;">Select an appointment date (past dates cannot be booked).</p>
          
          <div style="margin: 20px 0;">
            <label class="form-group">Appointment Date *</label>
            <input type="date" id="schedDate" class="clay-input" required>
          </div>

          <label class="form-group">Available Time Slot *</label>
          <div class="time-slot-picker">
            <div class="time-slot-btn selected" onclick="selectTimeSlot('Morning', this)">
              <i class="fa-regular fa-sun" style="font-size: 20px; display:block; margin-bottom: 6px; color: var(--primary);"></i>
              Morning<br><small style="color: var(--muted-text);">09:00 AM - 12:00 PM</small>
            </div>
            <div class="time-slot-btn" onclick="selectTimeSlot('Afternoon', this)">
              <i class="fa-solid fa-cloud-sun" style="font-size: 20px; display:block; margin-bottom: 6px; color: var(--secondary);"></i>
              Afternoon<br><small style="color: var(--muted-text);">12:00 PM - 04:00 PM</small>
            </div>
            <div class="time-slot-btn" onclick="selectTimeSlot('Evening', this)">
              <i class="fa-solid fa-moon" style="font-size: 20px; display:block; margin-bottom: 6px; color: var(--accent);"></i>
              Evening<br><small style="color: var(--muted-text);">04:00 PM - 08:00 PM</small>
            </div>
          </div>

          <div class="wizard-actions">
            <button type="button" class="clay-btn clay-btn-secondary" onclick="goToStep(3)">&larr; Back</button>
            <button type="button" class="clay-btn clay-btn-primary" onclick="prepareBookingSummary()">Review Summary &rarr;</button>
          </div>
        </div>

        <!-- Step 5: Summary -->
        <div class="wizard-step-panel" id="wizardPanel5">
          <h3 style="font-size: 22px; margin-bottom: 6px;">Booking Review & Confirmation</h3>
          <p style="color: var(--muted-text); font-size: 14px;">Please review your request before submitting.</p>
          
          <div class="summary-card-box" id="bookingSummaryContent"></div>

          <div style="background: #fff4eb; border-left: 4px solid var(--primary); padding: 14px 18px; border-radius: 12px; font-size: 13px; color: #7a4628; margin: 16px 0;">
            <i class="fa-solid fa-circle-info"></i> <strong>Disclaimer:</strong> Final pricing will be confirmed after on-site inspection or mutual project assessment by our assigned carpenter.
          </div>

          <div class="wizard-actions">
            <button type="button" class="clay-btn clay-btn-secondary" onclick="goToStep(4)">&larr; Modify</button>
            <button type="submit" class="clay-btn clay-btn-primary" id="submitBookingBtn">
              <i class="fa-solid fa-check"></i> Confirm & Book Now
            </button>
          </div>
        </div>
      </form>

      <!-- Step 6: Success Confirmation -->
      <div class="booking-success-box" id="wizardSuccessBox">
        <div class="success-icon-burst"><i class="fa-solid fa-check"></i></div>
        <h2 style="font-size: 28px; margin-bottom: 8px;">Booking Request Confirmed!</h2>
        <p style="color: var(--muted-text); font-size: 15px;">Your appointment has been registered in the WoodCraft Pro management system.</p>
        
        <div class="booking-id-pill" id="successBookingIdPill">
          <span>WCP-2026-00000</span>
          <button onclick="copyBookingId()" style="background:none; border:none; color:var(--primary); cursor:pointer;" title="Copy Booking ID"><i class="fa-regular fa-copy"></i></button>
        </div>

        <p style="font-size: 14px; max-width: 480px; margin: 0 auto 24px; color: var(--muted-text);">
          Our coordination lead will call you within 30 minutes to confirm your technician's dispatch. You can track this booking at any time in the "Track Booking" section.
        </p>

        <button class="clay-btn clay-btn-primary" onclick="closeBookingWizard(); window.location.reload();">
          Done & Close
        </button>
      </div>

    </div>
  </div>

  <!-- CLIENT-SIDE APPLICATION JAVASCRIPT -->
  <script>
    // State
    const bookingState = {
      selectedServices: [],
      selectedTimeSlot: 'Morning',
      currentStep: 1
    };

    // Set minimum date to today
    document.addEventListener('DOMContentLoaded', () => {
      const today = new Date().toISOString().split('T')[0];
      const schedDate = document.getElementById('schedDate');
      if (schedDate) schedDate.min = today;
    });

    function toggleMobileNav() {
      document.getElementById('mobileNavOverlay').classList.toggle('open');
      document.getElementById('mobileDrawer').classList.toggle('open');
    }

    // Modal controls
    function openBookingWizard(presetServiceId = null, presetCarpenterId = null) {
      document.getElementById('bookingModal').classList.add('active');
      goToStep(1);

      if (presetServiceId) {
        const item = document.querySelector(\`[onclick*="\${presetServiceId}"]\`);
        if (item && !item.classList.contains('selected')) {
          item.click();
        }
      }

      if (presetCarpenterId) {
        const carpSelect = document.getElementById('projCarpenter');
        if (carpSelect) carpSelect.value = presetCarpenterId;
      }
    }

    function closeBookingWizard() {
      document.getElementById('bookingModal').classList.remove('active');
    }

    function toggleServiceSelection(id, name, price, el) {
      const idx = bookingState.selectedServices.findIndex(s => s.id === id);
      if (idx > -1) {
        bookingState.selectedServices.splice(idx, 1);
        el.classList.remove('selected');
      } else {
        bookingState.selectedServices.push({ id, name, price });
        el.classList.add('selected');
      }
    }

    function selectTimeSlot(slot, el) {
      bookingState.selectedTimeSlot = slot;
      document.querySelectorAll('.time-slot-btn').forEach(btn => btn.classList.remove('selected'));
      el.classList.add('selected');
    }

    function goToStep(step) {
      if (step === 2 && bookingState.selectedServices.length === 0) {
        alert('Please select at least one service before proceeding.');
        return;
      }
      if (step === 3) {
        const name = document.getElementById('custName').value.trim();
        const phone = document.getElementById('custPhone').value.trim();
        const email = document.getElementById('custEmail').value.trim();
        const addr = document.getElementById('custAddress').value.trim();
        const pin = document.getElementById('custPincode').value.trim();
        if (!name || !phone || !email || !addr || !pin) {
          alert('Please complete all required fields (*).');
          return;
        }
      }
      if (step === 4) {
        const title = document.getElementById('projTitle').value.trim();
        if (!title) {
          alert('Please enter a project title/summary.');
          return;
        }
      }

      bookingState.currentStep = step;

      // Update panels
      for (let i = 1; i <= 5; i++) {
        const p = document.getElementById('wizardPanel' + i);
        const ind = document.getElementById('stepIndicator' + i);
        if (p) p.classList.toggle('active', i === step);
        if (ind) {
          ind.classList.toggle('active', i === step);
          ind.classList.toggle('done', i < step);
        }
      }
    }

    function prepareBookingSummary() {
      const dateVal = document.getElementById('schedDate').value;
      if (!dateVal) {
        alert('Please choose an appointment date.');
        return;
      }

      const totalEst = bookingState.selectedServices.reduce((sum, s) => sum + s.price, 0);
      const html = \`
        <div class="summary-row">
          <span>Customer:</span>
          <strong>\${document.getElementById('custName').value} (\${document.getElementById('custPhone').value})</strong>
        </div>
        <div class="summary-row">
          <span>Address:</span>
          <span>\${document.getElementById('custAddress').value}, \${document.getElementById('custCity').value} - \${document.getElementById('custPincode').value}</span>
        </div>
        <div class="summary-row">
          <span>Project:</span>
          <strong>\${document.getElementById('projTitle').value}</strong>
        </div>
        <div class="summary-row">
          <span>Schedule:</span>
          <strong>\${dateVal} (\${bookingState.selectedTimeSlot} Slot)</strong>
        </div>
        <div class="summary-row">
          <span>Selected Services:</span>
          <span>\${bookingState.selectedServices.map(s => s.name).join(', ')}</span>
        </div>
        <div class="summary-row total">
          <span>Estimated Starting Total:</span>
          <span>₹\${totalEst.toLocaleString('en-IN')}</span>
        </div>
      \`;

      document.getElementById('bookingSummaryContent').innerHTML = html;
      goToStep(5);
    }

    // Submit Booking
    async function handleBookingSubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('submitBookingBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting Request...';

      try {
        const formData = new FormData();
        formData.append('customerName', document.getElementById('custName').value);
        formData.append('phone', document.getElementById('custPhone').value);
        formData.append('email', document.getElementById('custEmail').value);
        formData.append('address', document.getElementById('custAddress').value);
        formData.append('city', document.getElementById('custCity').value);
        formData.append('area', document.getElementById('custArea').value);
        formData.append('pincode', document.getElementById('custPincode').value);
        formData.append('projectTitle', document.getElementById('projTitle').value);
        formData.append('description', document.getElementById('projDesc').value);
        formData.append('typeOfWork', document.getElementById('projType').value);
        formData.append('preferredCarpenter', document.getElementById('projCarpenter').value);
        formData.append('budget', document.getElementById('projBudget').value || '0');
        formData.append('preferredDate', document.getElementById('schedDate').value);
        formData.append('timeSlot', bookingState.selectedTimeSlot);
        formData.append('services', JSON.stringify(bookingState.selectedServices.map(s => s.id)));

        const imageFiles = document.getElementById('projImages').files;
        for (let i = 0; i < imageFiles.length; i++) {
          formData.append('projectImages', imageFiles[i]);
        }

        const res = await fetch('/api/bookings', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error || 'Booking submission failed');
        }

        // Show Success view
        document.getElementById('bookingWizardForm').style.display = 'none';
        document.querySelector('.wizard-steps-indicator').style.display = 'none';
        const successBox = document.getElementById('wizardSuccessBox');
        successBox.style.display = 'block';
        document.getElementById('successBookingIdPill').innerHTML = \`
          <span id="createdBookingId">\${data.booking.bookingId}</span>
          <button type="button" onclick="copyBookingId()" style="background:none; border:none; color:var(--primary); cursor:pointer;" title="Copy ID"><i class="fa-regular fa-copy"></i></button>
        \`;
      } catch (err) {
        alert('Error: ' + err.message);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirm & Book Now';
      }
    }

    function copyBookingId() {
      const idEl = document.getElementById('createdBookingId');
      if (idEl) {
        navigator.clipboard.writeText(idEl.innerText);
        alert('Booking ID copied to clipboard: ' + idEl.innerText);
      }
    }

    // Live Booking Tracking
    async function handleTrackBooking(e) {
      e.preventDefault();
      const bookingId = document.getElementById('trackBookingId').value.trim();
      const phone = document.getElementById('trackPhone').value.trim();
      const resultBox = document.getElementById('trackResultBox');

      resultBox.style.display = 'block';
      resultBox.innerHTML = '<p style="text-align:center; color:var(--muted-text);"><i class="fa-solid fa-spinner fa-spin"></i> Searching live project status...</p>';

      try {
        const res = await fetch('/api/bookings/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId, phone })
        });

        const json = await res.json();
        if (!json.success) {
          resultBox.innerHTML = \`<div style="color: #c92a2a; text-align: center; font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> \${json.error}</div>\`;
          return;
        }

        const b = json.data;
        const steps = ['Pending', 'Confirmed', 'Carpenter Assigned', 'Inspection Scheduled', 'Work In Progress', 'Completed'];
        const currentIdx = steps.indexOf(b.status);

        let stepsHtml = '';
        steps.forEach((stepName, idx) => {
          let nodeClass = 'tracker-node';
          if (idx < currentIdx) nodeClass += ' completed';
          else if (idx === currentIdx) nodeClass += ' active';

          stepsHtml += \`
            <div class="\${nodeClass}">
              <div class="node-icon"><i class="fa-solid fa-check"></i></div>
              <p>\${stepName}</p>
            </div>
          \`;
        });

        resultBox.innerHTML = \`
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px dashed #f1e2d6; padding-bottom: 16px;">
            <div>
              <span class="clay-pill" style="color:var(--primary); font-weight:700;">\${b.bookingId}</span>
              <h3 style="margin-top: 8px; font-size: 20px;">\${b.projectTitle}</h3>
              <p style="font-size: 13px; color: var(--muted-text);">Customer: \${b.customerName} | Schedule: \${new Date(b.preferredDate).toLocaleDateString()} (\${b.timeSlot})</p>
            </div>
            <div style="text-align: right;">
              <span class="clay-pill" style="background:#eafaf1; color:#2b8a3e; font-weight:700;">Status: \${b.status}</span>
              <div style="margin-top: 6px; font-size: 14px; font-weight:700; color:var(--primary);">
                Estimated: ₹\${b.estimatedPrice} | Final: ₹\${b.finalPrice || b.estimatedPrice}
              </div>
            </div>
          </div>

          <div class="status-tracker-rail">
            \${stepsHtml}
          </div>

          \${b.assignedCarpenter ? \`
            <div style="margin-top: 24px; padding: 16px; border-radius: 16px; background: #faf4ef; display: flex; align-items: center; gap: 16px;">
              <img src="\${b.assignedCarpenter.photoUrl}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;">
              <div>
                <strong>Assigned Carpenter: \${b.assignedCarpenter.name}</strong>
                <p style="font-size: 13px; color: var(--muted-text);">\${b.assignedCarpenter.specialization} • Phone: \${b.assignedCarpenter.phone}</p>
              </div>
            </div>
          \` : '<p style="text-align:center; font-size: 13px; color: var(--muted-text); margin-top: 20px;">Master Carpenter assignment currently in review by WoodCraft dispatch team.</p>'}
        \`;
      } catch (err) {
        resultBox.innerHTML = \`<div style="color: #c92a2a; text-align:center;">Network error. Please try again.</div>\`;
      }
    }

    // Lightbox
    function openLightbox(img, title, cat, desc) {
      document.getElementById('lightboxImg').src = img;
      document.getElementById('lightboxTitle').innerText = title;
      document.getElementById('lightboxCategory').innerText = cat;
      document.getElementById('lightboxDesc').innerText = desc;
      document.getElementById('lightboxModal').classList.add('active');
    }

    function closeLightbox(e) {
      if (!e || e.target.id === 'lightboxModal') {
        document.getElementById('lightboxModal').classList.remove('active');
      }
    }

    // Gallery filter
    function filterGallery(category, btn) {
      document.querySelectorAll('.gallery-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cards = document.querySelectorAll('.gallery-card');
      cards.forEach(card => {
        if (category === 'All' || card.getAttribute('data-category') === category) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    }

    // Public Contact Form
    async function handleContactSubmit(e) {
      e.preventDefault();
      const name = document.getElementById('contactName').value;
      const phone = document.getElementById('contactPhone').value;
      const message = document.getElementById('contactMessage').value;

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, phone, message })
        });
        const d = await res.json();
        alert(d.message || 'Thank you! We will reach out shortly.');
        document.getElementById('publicContactForm').reset();
      } catch {
        alert('Message received. Our lead will call you shortly.');
      }
    }
  </script>
</body>
</html>`;
}

// Start listening when run directly in local/container mode (Vercel invokes module directly)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`WoodCraft Pro server running on http://localhost:${PORT}`);
    console.log(`Admin Portal: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
