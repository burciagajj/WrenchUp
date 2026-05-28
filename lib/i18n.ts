import type { LocaleCode, RegionCode, RegionPreference } from "./types";

// USD -> MXN approximate conversion for display when region is MX (rough seed value).
// We multiply prices by this *after* the 60% Mexico discount so it feels local in pesos.
const USD_TO_MXN_DISPLAY = 17.5;
/** Multiplier applied to all USD estimate prices when region is MX. */
export const MX_DISCOUNT_MULTIPLIER = 0.4; // i.e. 60% off

export type StringKey =
  | "common.cancel"
  | "common.confirm"
  | "common.save"
  | "common.delete"
  | "common.done"
  | "common.back"
  | "common.refresh"
  | "common.searching"
  | "common.from"
  | "common.minutes_short"
  | "common.miles_short"
  | "common.km_short"
  | "common.optional"
  | "common.you"
  | "tabs.home"
  | "tabs.activity"
  | "tabs.vehicles"
  | "tabs.earnings"
  | "tabs.disputes"
  | "tabs.book_service"
  | "tabs.booked_requests"
  | "tabs.requirements"
  | "tabs.profile"
  | "home.greeting_morning"
  | "home.greeting_afternoon"
  | "home.greeting_evening"
  | "home.greeting_night"
  | "home.service_location"
  | "home.vehicle"
  | "home.change"
  | "home.request_mechanic"
  | "home.quick_services"
  | "home.symptom.title"
  | "home.symptom.subtitle"
  | "home.symptom.placeholder"
  | "home.symptom.vehicle"
  | "home.symptom.diagnose"
  | "home.symptom.diagnosing"
  | "home.symptom.recommended"
  | "home.symptom.book_now"
  | "home.symptom.try_again"
  | "home.symptom.error_short"
  | "home.symptom.error_failed"
  | "home.top_mechanics"
  | "home.see_all"
  | "home.no_vehicle"
  | "home.discount_banner"
  | "service.battery_jump"
  | "service.flat_tire"
  | "service.lockout"
  | "service.car_wash"
  | "service.oil_change"
  | "service.brake_service"
  | "service.diagnostic"
  | "service.engine_repair"
  | "service.ac_service"
  | "service.general_checkup"
  | "service.other"
  | "service.battery_jump_desc"
  | "service.flat_tire_desc"
  | "service.lockout_desc"
  | "service.car_wash_desc"
  | "service.oil_change_desc"
  | "service.brake_service_desc"
  | "service.diagnostic_desc"
  | "service.engine_repair_desc"
  | "service.ac_service_desc"
  | "service.general_checkup_desc"
  | "service.other_desc"
  | "service_select.title"
  | "service_select.cta_select"
  | "service_select.cta_find"
  | "mechanics.title"
  | "mechanics.for_service"
  | "mechanics.subtitle_default"
  | "mechanics.sort_eta"
  | "mechanics.sort_rating"
  | "mechanics.sort_price"
  | "mechanic.book_now"
  | "mechanic.estimate_label"
  | "mechanic.about"
  | "mechanic.specialties"
  | "mechanic.certifications"
  | "mechanic.reviews"
  | "mechanic.eta"
  | "mechanic.distance"
  | "mechanic.rate"
  | "mechanic.jobs"
  | "mechanic.years_short"
  | "confirm.title"
  | "confirm.service"
  | "confirm.vehicle"
  | "confirm.location"
  | "confirm.payment"
  | "confirm.fare_estimate"
  | "confirm.booking_fee"
  | "confirm.dispatch"
  | "confirm.estimated_total"
  | "confirm.disclaimer"
  | "confirm.cta_confirm"
  | "confirm.cta_add_vehicle"
  | "confirm.payment_card"
  | "tracking.title"
  | "tracking.searching"
  | "tracking.accepted"
  | "tracking.arriving_in"
  | "tracking.arrived"
  | "tracking.in_progress"
  | "tracking.completed"
  | "tracking.cancelled"
  | "tracking.cta_complete"
  | "tracking.cta_cancel"
  | "tracking.no_active"
  | "tracking.back_home"
  | "tracking.status"
  | "tracking.step_searching"
  | "tracking.step_accepted"
  | "tracking.step_enroute"
  | "tracking.step_arrived"
  | "tracking.step_in_progress"
  | "tracking.desc_searching"
  | "tracking.desc_accepted"
  | "tracking.desc_enroute"
  | "tracking.desc_arrived"
  | "tracking.desc_in_progress"
  | "complete.title"
  | "complete.by"
  | "complete.receipt"
  | "complete.tip"
  | "complete.no_tip"
  | "complete.add_tip"
  | "complete.rate_mechanic"
  | "complete.comment_placeholder"
  | "complete.cta_submit"
  | "activity.title"
  | "activity.subtitle"
  | "activity.filter_all"
  | "activity.filter_active"
  | "activity.filter_completed"
  | "activity.filter_cancelled"
  | "activity.empty_title"
  | "activity.empty_text"
  | "activity.status_searching"
  | "activity.status_accepted"
  | "activity.status_enroute"
  | "activity.status_arrived"
  | "activity.status_in_progress"
  | "activity.status_completed"
  | "activity.status_cancelled"
  | "vehicles.title"
  | "vehicles.subtitle"
  | "vehicles.empty_title"
  | "vehicles.empty_text"
  | "vehicles.add"
  | "vehicles.selected"
  | "vehicles.plate"
  | "vehicle_form.add_title"
  | "vehicle_form.edit_title"
  | "vehicle_form.nickname"
  | "vehicle_form.year"
  | "vehicle_form.make"
  | "vehicle_form.model"
  | "vehicle_form.color"
  | "vehicle_form.plate"
  | "vehicle_form.cta_save"
  | "vehicle_form.cta_add"
  | "vehicle_form.cta_delete"
  | "profile.title"
  | "profile.edit_name"
  | "profile.stats_services"
  | "profile.stats_spent"
  | "profile.stats_vehicles"
  | "profile.default_location"
  | "profile.section_account"
  | "profile.section_support"
  | "profile.section_mode"
  | "profile.section_region"
  | "profile.row_vehicles"
  | "profile.row_payment"
  | "profile.row_history"
  | "profile.row_help"
  | "profile.row_safety"
  | "profile.row_about"
  | "profile.payment_value"
  | "profile.completed_count"
  | "profile.role_customer"
  | "profile.role_customer_desc"
  | "profile.role_mechanic"
  | "profile.role_mechanic_desc"
  | "profile.region_auto"
  | "profile.region_us"
  | "profile.region_mx"
  | "profile.region_label_auto"
  | "profile.region_label_us"
  | "profile.region_label_mx"
  | "profile.region_help"
  | "mech_home.dashboard"
  | "mech_home.online"
  | "mech_home.offline"
  | "mech_home.online_headline"
  | "mech_home.offline_headline"
  | "mech_home.online_sub"
  | "mech_home.offline_sub"
  | "mech_home.active_banner"
  | "mech_home.stats"
  | "mech_home.earnings"
  | "mech_home.jobs_done"
  | "mech_home.rating"
  | "mech_home.recent"
  | "mech_home.empty_title"
  | "mech_home.empty_text"
  | "mech_home.switch_customer"
  | "incoming.title"
  | "incoming.payout"
  | "incoming.service"
  | "incoming.pickup"
  | "incoming.distance_label"
  | "incoming.estimated_time"
  | "incoming.distance_value"
  | "incoming.cta_accept"
  | "incoming.cta_decline"
  | "active_job.title"
  | "active_job.heading_to"
  | "active_job.arrived_at"
  | "active_job.in_progress"
  | "active_job.completed"
  | "active_job.payout_label"
  | "active_job.pickup_location"
  | "active_job.steps"
  | "active_job.step_heading"
  | "active_job.step_arrived"
  | "active_job.step_in_progress"
  | "active_job.desc_heading"
  | "active_job.desc_arrived"
  | "active_job.desc_in_progress"
  | "active_job.cta_arrived"
  | "active_job.cta_start"
  | "active_job.cta_complete"
  | "active_job.cta_cancel"
  | "notif.accepted_title"
  | "notif.accepted_body"
  | "notif.enroute_title"
  | "notif.enroute_body"
  | "notif.arrived_title"
  | "notif.arrived_body"
  | "notif.started_title"
  | "notif.started_body"
  | "notif.completed_title"
  | "notif.completed_body"
  | "notif.new_job_title"
  | "notif.new_job_body"
  | "notif.job_accepted_title"
  | "notif.job_accepted_body"
  | "notif.job_completed_title"
  | "notif.job_completed_body"
  | "payment.methods_title"
  | "payment.methods_subtitle"
  | "payment.no_methods"
  | "payment.add_card"
  | "payment.delete_confirm_title"
  | "payment.delete_confirm_msg"
  | "auth.signin.title"
  | "auth.signin.subtitle"
  | "auth.signin.email"
  | "auth.signin.password"
  | "auth.signin.password_placeholder"
  | "auth.signin.forgot"
  | "auth.signin.cta"
  | "auth.signin.no_account"
  | "auth.signin.sign_up"
  | "auth.signin.show"
  | "auth.signin.hide"
  | "auth.signin.error_email_required"
  | "auth.signin.error_email_invalid"
  | "auth.signin.error_password_required"
  | "auth.signin.error_failed"
  | "auth.signin.error_invalid_credentials"
  | "auth.signin.error_user_not_found"
  | "auth.forgot.title"
  | "auth.forgot.subtitle"
  | "auth.forgot.email"
  | "auth.forgot.cta"
  | "auth.forgot.back"
  | "auth.forgot.success"
  | "auth.forgot.error_email_required"
  | "auth.forgot.error_email_invalid"
  | "auth.forgot.error_failed"
  | "auth.signup.title"
  | "auth.signup.subtitle"
  | "auth.signup.role_label"
  | "auth.signup.role_customer"
  | "auth.signup.role_customer_desc"
  | "auth.signup.role_mechanic"
  | "auth.signup.role_mechanic_desc"
  | "auth.signup.email"
  | "auth.signup.password"
  | "auth.signup.password_placeholder"
  | "auth.signup.confirm_password"
  | "auth.signup.confirm_placeholder"
  | "auth.signup.cta"
  | "auth.signup.has_account"
  | "auth.signup.sign_in"
  | "auth.signup.error_email_required"
  | "auth.signup.error_email_invalid"
  | "auth.signup.error_password_required"
  | "auth.signup.error_password_short"
  | "auth.signup.error_password_mismatch"
  | "auth.signup.error_failed"
  | "auth.signup.error_exists"
  | "auth.signup.error_weak_password"
  | "auth.signup.error_session"
  | "auth.signup.error_verify_email";

export type Strings = Record<StringKey, string>;

export const STRINGS_EN: Strings = {
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
  "common.delete": "Delete",
  "common.done": "Done",
  "common.back": "Back",
  "common.refresh": "Refresh",
  "common.searching": "Searching",
  "common.from": "from",
  "common.minutes_short": "min",
  "common.miles_short": "mi",
  "common.km_short": "km",
  "common.optional": "optional",
  "common.you": "You",
  "tabs.home": "Home",
  "tabs.activity": "Activity",
  "tabs.vehicles": "Vehicles",
  "tabs.earnings": "Earnings",
  "tabs.disputes": "Disputes",
  "tabs.book_service": "Book a Service",
  "tabs.booked_requests": "Booked Requests",
  "tabs.requirements": "Requirements",
  "tabs.profile": "Profile",
  "home.greeting_morning": "Good morning",
  "home.greeting_afternoon": "Good afternoon",
  "home.greeting_evening": "Good evening",
  "home.greeting_night": "Working late",
  "home.service_location": "SERVICE LOCATION",
  "home.vehicle": "VEHICLE",
  "home.change": "Change",
  "home.request_mechanic": "Request a Mechanic",
  "home.quick_services": "Quick services",
  "home.symptom.title": "What's wrong with your car?",
  "home.symptom.subtitle": "Describe your issue — AI will find the right service",
  "home.symptom.placeholder": "e.g. Car won't start, clicking sound when I turn the key…",
  "home.symptom.vehicle": "Vehicle",
  "home.symptom.diagnose": "Diagnose",
  "home.symptom.diagnosing": "Diagnosing…",
  "home.symptom.recommended": "Recommended service",
  "home.symptom.book_now": "Book Now",
  "home.symptom.try_again": "Describe a different issue",
  "home.symptom.error_short": "Please add a few more details about the problem.",
  "home.symptom.error_failed": "Could not diagnose right now. Please try again.",
  "home.top_mechanics": "Top mechanics near you",
  "home.see_all": "See all",
  "home.no_vehicle": "No vehicle selected",
  "home.discount_banner": "México pricing active — 60% off displayed estimates",
  "service.battery_jump": "Battery Jump",
  "service.flat_tire": "Flat Tire",
  "service.lockout": "Lockout",
  "service.car_wash": "Car Wash",
  "service.oil_change": "Oil Change",
  "service.brake_service": "Brake Service",
  "service.diagnostic": "Diagnostic",
  "service.engine_repair": "Engine Repair",
  "service.ac_service": "A/C Service",
  "service.general_checkup": "Check-Up",
  "service.other": "Other",
  "service.battery_jump_desc": "Jump start a dead battery or test/replace it on the spot.",
  "service.flat_tire_desc": "Tire change, patch, or spare installation at your location.",
  "service.lockout_desc": "Unlock your vehicle when your keys are locked inside.",
  "service.car_wash_desc": "On-site exterior wash with a quick interior cleanup.",
  "service.oil_change_desc": "Full synthetic oil change and filter replacement.",
  "service.brake_service_desc": "Pads, rotors, fluid check, and brake inspection.",
  "service.diagnostic_desc": "OBD-II scan and full system diagnostic with written report.",
  "service.engine_repair_desc": "On-site fixes for common engine issues and minor repairs.",
  "service.ac_service_desc": "Recharge, leak check, and A/C performance inspection.",
  "service.general_checkup_desc": "Multi-point inspection covering fluids, belts, and brakes.",
  "service.other_desc": "Tell us what you need and submit a custom booking request.",
  "service_select.title": "Choose a service",
  "service_select.cta_select": "Select a service",
  "service_select.cta_find": "Find mechanics",
  "mechanics.title": "Available mechanics",
  "mechanics.for_service": "For {service}",
  "mechanics.subtitle_default": "Nearby pros ready to help",
  "mechanics.sort_eta": "Fastest ETA",
  "mechanics.sort_rating": "Top rated",
  "mechanics.sort_price": "Lowest rate",
  "mechanic.book_now": "Book Now",
  "mechanic.estimate_label": "{service} estimate",
  "mechanic.about": "About",
  "mechanic.specialties": "Specialties",
  "mechanic.certifications": "Certifications",
  "mechanic.reviews": "Reviews",
  "mechanic.eta": "ETA",
  "mechanic.distance": "Distance",
  "mechanic.rate": "Rate",
  "mechanic.jobs": "jobs",
  "mechanic.years_short": "{years}+ years",
  "confirm.title": "Confirm booking",
  "confirm.service": "Service",
  "confirm.vehicle": "Vehicle",
  "confirm.location": "Location",
  "confirm.payment": "Payment",
  "confirm.fare_estimate": "Fare estimate",
  "confirm.booking_fee": "Booking fee",
  "confirm.dispatch": "Dispatch ({distance} {unit})",
  "confirm.estimated_total": "Estimated total",
  "confirm.disclaimer": "Final amount may vary based on actual time and parts. You'll review the receipt before payment.",
  "confirm.cta_confirm": "Confirm & Request",
  "confirm.cta_add_vehicle": "Add a vehicle first",
  "confirm.payment_card": "Visa •••• 4242",
  "tracking.title": "Live tracking",
  "tracking.searching": "Finding the best nearby mechanic…",
  "tracking.accepted": "Mechanic accepted your request",
  "tracking.arriving_in": "Arriving in {minutes} min",
  "tracking.arrived": "Your mechanic has arrived",
  "tracking.in_progress": "Service in progress",
  "tracking.completed": "Service complete",
  "tracking.cancelled": "Service cancelled",
  "tracking.cta_complete": "Mark service complete",
  "tracking.cta_cancel": "Cancel service",
  "tracking.no_active": "No active job",
  "tracking.back_home": "Back to home",
  "tracking.status": "Status",
  "tracking.step_searching": "Searching",
  "tracking.step_accepted": "Accepted",
  "tracking.step_enroute": "On the way",
  "tracking.step_arrived": "Arrived",
  "tracking.step_in_progress": "Service in progress",
  "tracking.desc_searching": "We're matching you with a nearby pro.",
  "tracking.desc_accepted": "{name} accepted and is on their way.",
  "tracking.desc_enroute": "{name} is driving to your location.",
  "tracking.desc_arrived": "Greet your mechanic and walk them to your vehicle.",
  "tracking.desc_in_progress": "Your service is underway.",
  "complete.title": "Service complete",
  "complete.by": "{service} by {name}",
  "complete.receipt": "Receipt",
  "complete.tip": "Tip",
  "complete.no_tip": "No tip",
  "complete.add_tip": "Add a tip",
  "complete.rate_mechanic": "Rate {name}",
  "complete.comment_placeholder": "Leave a comment (optional)",
  "complete.cta_submit": "Submit & Done",
  "activity.title": "Activity",
  "activity.subtitle": "Your service history",
  "activity.filter_all": "All",
  "activity.filter_active": "Active",
  "activity.filter_completed": "Completed",
  "activity.filter_cancelled": "Cancelled",
  "activity.empty_title": "No jobs yet",
  "activity.empty_text": "Once you book a mechanic, your service history will show up here.",
  "activity.status_searching": "Searching",
  "activity.status_accepted": "Accepted",
  "activity.status_enroute": "En route",
  "activity.status_arrived": "Arrived",
  "activity.status_in_progress": "In progress",
  "activity.status_completed": "Completed",
  "activity.status_cancelled": "Cancelled",
  "vehicles.title": "Vehicles",
  "vehicles.subtitle": "Add cars you want serviced",
  "vehicles.empty_title": "No vehicles yet",
  "vehicles.empty_text": "Add your first vehicle so mechanics know what they're working on.",
  "vehicles.add": "Add Vehicle",
  "vehicles.selected": "SELECTED",
  "vehicles.plate": "Plate",
  "vehicle_form.add_title": "Add vehicle",
  "vehicle_form.edit_title": "Edit vehicle",
  "vehicle_form.nickname": "Nickname",
  "vehicle_form.year": "Year",
  "vehicle_form.make": "Make",
  "vehicle_form.model": "Model",
  "vehicle_form.color": "Color",
  "vehicle_form.plate": "License plate",
  "vehicle_form.cta_save": "Save changes",
  "vehicle_form.cta_add": "Add vehicle",
  "vehicle_form.cta_delete": "Delete vehicle",
  "profile.title": "Profile",
  "profile.edit_name": "Edit name",
  "profile.stats_services": "Services",
  "profile.stats_spent": "Spent",
  "profile.stats_vehicles": "Vehicles",
  "profile.default_location": "Default service location",
  "profile.section_account": "Account",
  "profile.section_support": "Support",
  "profile.section_mode": "Mode",
  "profile.section_region": "Region",
  "profile.row_vehicles": "My Vehicles",
  "profile.row_payment": "Payment method",
  "profile.row_history": "Service history",
  "profile.row_help": "Help & FAQ",
  "profile.row_safety": "Safety center",
  "profile.row_about": "About WrenchUp",
  "profile.payment_value": "Visa •••• 4242",
  "profile.completed_count": "{n} completed",
  "profile.role_customer": "Customer",
  "profile.role_customer_desc": "Request mechanics for your vehicles.",
  "profile.role_mechanic": "Mechanic",
  "profile.role_mechanic_desc": "Receive incoming jobs from nearby customers.",
  "profile.region_auto": "Auto-detect",
  "profile.region_us": "United States",
  "profile.region_mx": "México",
  "profile.region_label_auto": "Follows your location",
  "profile.region_label_us": "USD pricing, English",
  "profile.region_label_mx": "MXN pricing, Latin Spanish (60% off)",
  "profile.region_help": "Mechanics or customers in México get prices in pesos with a 60% discount on estimates.",
  "mech_home.dashboard": "Mechanic dashboard",
  "mech_home.online": "ONLINE",
  "mech_home.offline": "OFFLINE",
  "mech_home.online_headline": "Receiving job requests",
  "mech_home.offline_headline": "Go online to start earning",
  "mech_home.online_sub": "We'll send you nearby jobs as they come in.",
  "mech_home.offline_sub": "Toggle on when you're ready to accept work.",
  "mech_home.active_banner": "Active job in progress",
  "mech_home.stats": "Today's stats",
  "mech_home.earnings": "Earnings",
  "mech_home.jobs_done": "Jobs done",
  "mech_home.rating": "Rating",
  "mech_home.recent": "Recent activity",
  "mech_home.empty_title": "No jobs yet",
  "mech_home.empty_text": "Go online and we'll route incoming requests to you here.",
  "mech_home.switch_customer": "Switch to customer mode",
  "incoming.title": "New job request",
  "incoming.payout": "PAYOUT",
  "incoming.service": "Service",
  "incoming.pickup": "Pickup",
  "incoming.distance_label": "Distance",
  "incoming.estimated_time": "Estimated time",
  "incoming.distance_value": "{distance} mi away",
  "incoming.cta_accept": "Accept",
  "incoming.cta_decline": "Decline",
  "active_job.title": "Active job",
  "active_job.heading_to": "Heading to {name}",
  "active_job.arrived_at": "You've arrived at {name}'s location",
  "active_job.in_progress": "Service in progress",
  "active_job.completed": "Job complete",
  "active_job.payout_label": "payout",
  "active_job.pickup_location": "Pickup location",
  "active_job.steps": "Your steps",
  "active_job.step_heading": "Heading there",
  "active_job.step_arrived": "Arrived",
  "active_job.step_in_progress": "Service in progress",
  "active_job.desc_heading": "Drive to the customer location.",
  "active_job.desc_arrived": "Find the customer and confirm the vehicle.",
  "active_job.desc_in_progress": "Perform the service.",
  "active_job.cta_arrived": "I've arrived",
  "active_job.cta_start": "Start service",
  "active_job.cta_complete": "Mark complete",
  "active_job.cta_cancel": "Cancel job",
  "notif.accepted_title": "Mechanic accepted",
  "notif.accepted_body": "{name} accepted your {service} request.",
  "notif.enroute_title": "On the way",
  "notif.enroute_body": "{name} is heading to your location.",
  "notif.arrived_title": "Mechanic arrived",
  "notif.arrived_body": "{name} is at your location.",
  "notif.started_title": "Service started",
  "notif.started_body": "{name} has started the {service}.",
  "notif.completed_title": "Service complete",
  "notif.completed_body": "Tap to leave a rating and tip.",
  "notif.new_job_title": "New job request",
  "notif.new_job_body": "{service} • {price} • {distance} mi",
  "notif.job_accepted_title": "Job accepted",
  "notif.job_accepted_body": "{name} is expecting you. ETA {minutes} min.",
  "notif.job_completed_title": "Job completed",
  "notif.job_completed_body": "You earned {price} on this trip.",
  "payment.methods_title": "Payment Methods",
  "payment.methods_subtitle": "Manage your cards",
  "payment.no_methods": "No payment methods",
  "payment.add_card": "Add Card",
  "payment.delete_confirm_title": "Delete Card",
  "payment.delete_confirm_msg": "Are you sure you want to delete this card?",
  "auth.signin.title": "Welcome Back",
  "auth.signin.subtitle": "Sign in to your WrenchUp account",
  "auth.signin.email": "Email",
  "auth.signin.password": "Password",
  "auth.signin.password_placeholder": "Enter your password",
  "auth.signin.forgot": "Forgot password?",
  "auth.signin.cta": "Sign In",
  "auth.signin.no_account": "Don't have an account?",
  "auth.signin.sign_up": "Sign Up",
  "auth.signin.show": "Show",
  "auth.signin.hide": "Hide",
  "auth.signin.error_email_required": "Email is required",
  "auth.signin.error_email_invalid": "Please enter a valid email address",
  "auth.signin.error_password_required": "Password is required",
  "auth.signin.error_failed": "Sign-in failed. Please try again.",
  "auth.signin.error_invalid_credentials": "Invalid email or password. Please try again.",
  "auth.signin.error_user_not_found": "No account found with this email. Please sign up first.",
  "auth.forgot.title": "Reset Password",
  "auth.forgot.subtitle": "Enter your email to receive a password reset link",
  "auth.forgot.email": "Email",
  "auth.forgot.cta": "Send Reset Link",
  "auth.forgot.back": "Back to Sign In",
  "auth.forgot.success": "Check your email for a password reset link. It may take a few minutes to arrive.",
  "auth.forgot.error_email_required": "Please enter your email address",
  "auth.forgot.error_email_invalid": "Please enter a valid email address",
  "auth.forgot.error_failed": "Failed to send reset email. Please try again.",
  "auth.signup.title": "Create Account",
  "auth.signup.subtitle": "Join WrenchUp and get started",
  "auth.signup.role_label": "I am a:",
  "auth.signup.role_customer": "Customer",
  "auth.signup.role_customer_desc": "Need a mechanic",
  "auth.signup.role_mechanic": "Mechanic",
  "auth.signup.role_mechanic_desc": "Offer services",
  "auth.signup.email": "Email",
  "auth.signup.password": "Password",
  "auth.signup.password_placeholder": "At least 8 characters",
  "auth.signup.confirm_password": "Confirm Password",
  "auth.signup.confirm_placeholder": "Repeat password",
  "auth.signup.cta": "Create Account",
  "auth.signup.has_account": "Already have an account?",
  "auth.signup.sign_in": "Sign In",
  "auth.signup.error_email_required": "Email is required",
  "auth.signup.error_email_invalid": "Please enter a valid email address",
  "auth.signup.error_password_required": "Password is required",
  "auth.signup.error_password_short": "Password must be at least 8 characters",
  "auth.signup.error_password_mismatch": "Passwords do not match",
  "auth.signup.error_failed": "Sign-up failed. Please try again.",
  "auth.signup.error_exists": "This email is already registered. Please sign in instead.",
  "auth.signup.error_weak_password": "Password is too weak. Use at least 8 characters with letters and numbers.",
  "auth.signup.error_session": "Account created but session could not start. Please sign in to finish your profile.",
  "auth.signup.error_verify_email": "Account created! Check your email to verify, then sign in to complete your profile.",
};

export const STRINGS_ES_MX: Strings = {
  "common.cancel": "Cancelar",
  "common.confirm": "Confirmar",
  "common.save": "Guardar",
  "common.delete": "Eliminar",
  "common.done": "Listo",
  "common.back": "Atrás",
  "common.refresh": "Actualizar",
  "common.searching": "Buscando",
  "common.from": "desde",
  "common.minutes_short": "min",
  "common.miles_short": "mi",
  "common.km_short": "km",
  "common.optional": "opcional",
  "common.you": "Tú",
  "tabs.home": "Inicio",
  "tabs.activity": "Actividad",
  "tabs.vehicles": "Vehículos",
  "tabs.earnings": "Ganancias",
  "tabs.disputes": "Disputas",
  "tabs.book_service": "Agendar servicio",
  "tabs.booked_requests": "Solicitudes agendadas",
  "tabs.requirements": "Requisitos",
  "tabs.profile": "Perfil",
  "home.greeting_morning": "Buenos días",
  "home.greeting_afternoon": "Buenas tardes",
  "home.greeting_evening": "Buenas noches",
  "home.greeting_night": "Trabajando hasta tarde",
  "home.service_location": "UBICACIÓN DEL SERVICIO",
  "home.vehicle": "VEHÍCULO",
  "home.change": "Cambiar",
  "home.request_mechanic": "Solicitar un mecánico",
  "home.quick_services": "Servicios rápidos",
  "home.symptom.title": "¿Qué le pasa a tu auto?",
  "home.symptom.subtitle": "Describe el problema — la IA encontrará el servicio correcto",
  "home.symptom.placeholder": "ej. No enciende, hace clic al girar la llave…",
  "home.symptom.vehicle": "Vehículo",
  "home.symptom.diagnose": "Diagnosticar",
  "home.symptom.diagnosing": "Diagnosticando…",
  "home.symptom.recommended": "Servicio recomendado",
  "home.symptom.book_now": "Reservar ahora",
  "home.symptom.try_again": "Describir otro problema",
  "home.symptom.error_short": "Agrega un poco más de detalle sobre el problema.",
  "home.symptom.error_failed": "No se pudo diagnosticar. Intenta de nuevo.",
  "home.top_mechanics": "Mejores mecánicos cerca de ti",
  "home.see_all": "Ver todos",
  "home.no_vehicle": "Sin vehículo seleccionado",
  "home.discount_banner": "Precios México activos — 60% de descuento en estimados",
  "service.battery_jump": "Pasar corriente",
  "service.flat_tire": "Llanta ponchada",
  "service.lockout": "Llaves adentro",
  "service.car_wash": "Lavado de auto",
  "service.oil_change": "Cambio de aceite",
  "service.brake_service": "Servicio de frenos",
  "service.diagnostic": "Diagnóstico",
  "service.engine_repair": "Reparación de motor",
  "service.ac_service": "Servicio de A/C",
  "service.general_checkup": "Revisión general",
  "service.other": "Otro",
  "service.battery_jump_desc": "Pasamos corriente o probamos/cambiamos la batería en el momento.",
  "service.flat_tire_desc": "Cambio de llanta, parche o instalación de la refacción donde estés.",
  "service.lockout_desc": "Abrimos tu vehículo cuando las llaves se quedaron dentro.",
  "service.car_wash_desc": "Lavado exterior a domicilio con limpieza interior rápida.",
  "service.oil_change_desc": "Cambio de aceite sintético completo y filtro nuevo.",
  "service.brake_service_desc": "Pastillas, discos, revisión del líquido e inspección de frenos.",
  "service.diagnostic_desc": "Escaneo OBD-II y diagnóstico completo con reporte por escrito.",
  "service.engine_repair_desc": "Reparaciones comunes y arreglos menores de motor en sitio.",
  "service.ac_service_desc": "Recarga, prueba de fugas y revisión de desempeño del A/C.",
  "service.general_checkup_desc": "Inspección de varios puntos: fluidos, bandas y frenos.",
  "service.other_desc": "Cuéntanos tu problema y envía una reserva personalizada.",
  "service_select.title": "Elige un servicio",
  "service_select.cta_select": "Selecciona un servicio",
  "service_select.cta_find": "Buscar mecánicos",
  "mechanics.title": "Mecánicos disponibles",
  "mechanics.for_service": "Para {service}",
  "mechanics.subtitle_default": "Profesionales cerca listos para ayudar",
  "mechanics.sort_eta": "Llegada más rápida",
  "mechanics.sort_rating": "Mejor calificados",
  "mechanics.sort_price": "Tarifa más baja",
  "mechanic.book_now": "Reservar ahora",
  "mechanic.estimate_label": "Estimado de {service}",
  "mechanic.about": "Acerca de",
  "mechanic.specialties": "Especialidades",
  "mechanic.certifications": "Certificaciones",
  "mechanic.reviews": "Reseñas",
  "mechanic.eta": "Llegada",
  "mechanic.distance": "Distancia",
  "mechanic.rate": "Tarifa",
  "mechanic.jobs": "trabajos",
  "mechanic.years_short": "{years}+ años",
  "confirm.title": "Confirmar reserva",
  "confirm.service": "Servicio",
  "confirm.vehicle": "Vehículo",
  "confirm.location": "Ubicación",
  "confirm.payment": "Pago",
  "confirm.fare_estimate": "Estimado de tarifa",
  "confirm.booking_fee": "Cargo por reserva",
  "confirm.dispatch": "Traslado ({distance} {unit})",
  "confirm.estimated_total": "Total estimado",
  "confirm.disclaimer": "El monto final puede variar según el tiempo real y las refacciones. Verás el recibo antes de pagar.",
  "confirm.cta_confirm": "Confirmar y solicitar",
  "confirm.cta_add_vehicle": "Primero agrega un vehículo",
  "confirm.payment_card": "Visa •••• 4242",
  "tracking.title": "Seguimiento en vivo",
  "tracking.searching": "Buscando al mejor mecánico cercano…",
  "tracking.accepted": "El mecánico aceptó tu solicitud",
  "tracking.arriving_in": "Llega en {minutes} min",
  "tracking.arrived": "Tu mecánico ha llegado",
  "tracking.in_progress": "Servicio en curso",
  "tracking.completed": "Servicio terminado",
  "tracking.cancelled": "Servicio cancelado",
  "tracking.cta_complete": "Marcar como completado",
  "tracking.cta_cancel": "Cancelar servicio",
  "tracking.no_active": "Sin trabajo activo",
  "tracking.back_home": "Volver al inicio",
  "tracking.status": "Estado",
  "tracking.step_searching": "Buscando",
  "tracking.step_accepted": "Aceptado",
  "tracking.step_enroute": "En camino",
  "tracking.step_arrived": "Llegó",
  "tracking.step_in_progress": "Servicio en curso",
  "tracking.desc_searching": "Te estamos asignando un profesional cerca.",
  "tracking.desc_accepted": "{name} aceptó y va en camino.",
  "tracking.desc_enroute": "{name} se dirige a tu ubicación.",
  "tracking.desc_arrived": "Recibe a tu mecánico y llévalo a tu vehículo.",
  "tracking.desc_in_progress": "Tu servicio está en proceso.",
  "complete.title": "Servicio terminado",
  "complete.by": "{service} por {name}",
  "complete.receipt": "Recibo",
  "complete.tip": "Propina",
  "complete.no_tip": "Sin propina",
  "complete.add_tip": "Agregar propina",
  "complete.rate_mechanic": "Califica a {name}",
  "complete.comment_placeholder": "Deja un comentario (opcional)",
  "complete.cta_submit": "Enviar y listo",
  "activity.title": "Actividad",
  "activity.subtitle": "Tu historial de servicios",
  "activity.filter_all": "Todos",
  "activity.filter_active": "Activos",
  "activity.filter_completed": "Completados",
  "activity.filter_cancelled": "Cancelados",
  "activity.empty_title": "Aún no hay trabajos",
  "activity.empty_text": "Cuando reserves un mecánico, tu historial aparecerá aquí.",
  "activity.status_searching": "Buscando",
  "activity.status_accepted": "Aceptado",
  "activity.status_enroute": "En camino",
  "activity.status_arrived": "Llegó",
  "activity.status_in_progress": "En curso",
  "activity.status_completed": "Completado",
  "activity.status_cancelled": "Cancelado",
  "vehicles.title": "Vehículos",
  "vehicles.subtitle": "Agrega los autos que quieres atender",
  "vehicles.empty_title": "Aún no hay vehículos",
  "vehicles.empty_text": "Agrega tu primer vehículo para que el mecánico sepa qué atender.",
  "vehicles.add": "Agregar vehículo",
  "vehicles.selected": "SELECCIONADO",
  "vehicles.plate": "Placa",
  "vehicle_form.add_title": "Agregar vehículo",
  "vehicle_form.edit_title": "Editar vehículo",
  "vehicle_form.nickname": "Apodo",
  "vehicle_form.year": "Año",
  "vehicle_form.make": "Marca",
  "vehicle_form.model": "Modelo",
  "vehicle_form.color": "Color",
  "vehicle_form.plate": "Placa",
  "vehicle_form.cta_save": "Guardar cambios",
  "vehicle_form.cta_add": "Agregar vehículo",
  "vehicle_form.cta_delete": "Eliminar vehículo",
  "profile.title": "Perfil",
  "profile.edit_name": "Editar nombre",
  "profile.stats_services": "Servicios",
  "profile.stats_spent": "Gastado",
  "profile.stats_vehicles": "Vehículos",
  "profile.default_location": "Ubicación predeterminada",
  "profile.section_account": "Cuenta",
  "profile.section_support": "Soporte",
  "profile.section_mode": "Modo",
  "profile.section_region": "Región",
  "profile.row_vehicles": "Mis vehículos",
  "profile.row_payment": "Método de pago",
  "profile.row_history": "Historial de servicios",
  "profile.row_help": "Ayuda y preguntas",
  "profile.row_safety": "Centro de seguridad",
  "profile.row_about": "Acerca de WrenchUp",
  "profile.payment_value": "Visa •••• 4242",
  "profile.completed_count": "{n} completados",
  "profile.role_customer": "Cliente",
  "profile.role_customer_desc": "Solicita mecánicos para tus vehículos.",
  "profile.role_mechanic": "Mecánico",
  "profile.role_mechanic_desc": "Recibe trabajos de clientes cercanos.",
  "profile.region_auto": "Detectar automáticamente",
  "profile.region_us": "Estados Unidos",
  "profile.region_mx": "México",
  "profile.region_label_auto": "Sigue tu ubicación",
  "profile.region_label_us": "Precios en USD, inglés",
  "profile.region_label_mx": "Precios en MXN, español (60% de descuento)",
  "profile.region_help": "Mecánicos o clientes en México ven precios en pesos con 60% de descuento en los estimados.",
  "mech_home.dashboard": "Panel del mecánico",
  "mech_home.online": "EN LÍNEA",
  "mech_home.offline": "DESCONECTADO",
  "mech_home.online_headline": "Recibiendo solicitudes",
  "mech_home.offline_headline": "Conéctate para empezar a ganar",
  "mech_home.online_sub": "Te enviaremos trabajos cercanos en cuanto lleguen.",
  "mech_home.offline_sub": "Actívalo cuando estés listo para aceptar trabajos.",
  "mech_home.active_banner": "Trabajo activo en curso",
  "mech_home.stats": "Estadísticas de hoy",
  "mech_home.earnings": "Ganancias",
  "mech_home.jobs_done": "Trabajos hechos",
  "mech_home.rating": "Calificación",
  "mech_home.recent": "Actividad reciente",
  "mech_home.empty_title": "Aún no hay trabajos",
  "mech_home.empty_text": "Conéctate y te enviaremos las solicitudes que lleguen aquí.",
  "mech_home.switch_customer": "Cambiar a modo cliente",
  "incoming.title": "Nueva solicitud",
  "incoming.payout": "PAGO",
  "incoming.service": "Servicio",
  "incoming.pickup": "Punto de recogida",
  "incoming.distance_label": "Distancia",
  "incoming.estimated_time": "Tiempo estimado",
  "incoming.distance_value": "{distance} mi de distancia",
  "incoming.cta_accept": "Aceptar",
  "incoming.cta_decline": "Rechazar",
  "active_job.title": "Trabajo activo",
  "active_job.heading_to": "En camino con {name}",
  "active_job.arrived_at": "Llegaste con {name}",
  "active_job.in_progress": "Servicio en curso",
  "active_job.completed": "Trabajo terminado",
  "active_job.payout_label": "pago",
  "active_job.pickup_location": "Ubicación de recogida",
  "active_job.steps": "Tus pasos",
  "active_job.step_heading": "En camino",
  "active_job.step_arrived": "Llegó",
  "active_job.step_in_progress": "Servicio en curso",
  "active_job.desc_heading": "Maneja a la ubicación del cliente.",
  "active_job.desc_arrived": "Encuentra al cliente y confirma el vehículo.",
  "active_job.desc_in_progress": "Realiza el servicio.",
  "active_job.cta_arrived": "Ya llegué",
  "active_job.cta_start": "Iniciar servicio",
  "active_job.cta_complete": "Marcar completo",
  "active_job.cta_cancel": "Cancelar trabajo",
  "notif.accepted_title": "Mecánico aceptado",
  "notif.accepted_body": "{name} aceptó tu solicitud de {service}.",
  "notif.enroute_title": "En camino",
  "notif.enroute_body": "{name} se dirige a tu ubicación.",
  "notif.arrived_title": "Mecánico llegó",
  "notif.arrived_body": "{name} está en tu ubicación.",
  "notif.started_title": "Servicio iniciado",
  "notif.started_body": "{name} comenzó el servicio: {service}.",
  "notif.completed_title": "Servicio terminado",
  "notif.completed_body": "Toca para calificar y dejar propina.",
  "notif.new_job_title": "Nueva solicitud",
  "notif.new_job_body": "{service} • {price} • {distance} mi",
  "notif.job_accepted_title": "Trabajo aceptado",
  "notif.job_accepted_body": "{name} te espera. Llegada {minutes} min.",
  "notif.job_completed_title": "Trabajo terminado",
  "notif.job_completed_body": "Ganaste {price} en este trabajo.",
  "payment.methods_title": "Métodos de Pago",
  "payment.methods_subtitle": "Gestiona tus tarjetas",
  "payment.no_methods": "Sin métodos de pago",
  "payment.add_card": "Agregar Tarjeta",
  "payment.delete_confirm_title": "Eliminar Tarjeta",
  "payment.delete_confirm_msg": "¿Estás seguro de que deseas eliminar esta tarjeta?",
  "auth.signin.title": "Bienvenido de nuevo",
  "auth.signin.subtitle": "Inicia sesión en tu cuenta de WrenchUp",
  "auth.signin.email": "Correo electrónico",
  "auth.signin.password": "Contraseña",
  "auth.signin.password_placeholder": "Ingresa tu contraseña",
  "auth.signin.forgot": "¿Olvidaste tu contraseña?",
  "auth.signin.cta": "Iniciar sesión",
  "auth.signin.no_account": "¿No tienes cuenta?",
  "auth.signin.sign_up": "Regístrate",
  "auth.signin.show": "Mostrar",
  "auth.signin.hide": "Ocultar",
  "auth.signin.error_email_required": "El correo es obligatorio",
  "auth.signin.error_email_invalid": "Ingresa un correo válido",
  "auth.signin.error_password_required": "La contraseña es obligatoria",
  "auth.signin.error_failed": "No se pudo iniciar sesión. Intenta de nuevo.",
  "auth.signin.error_invalid_credentials": "Correo o contraseña incorrectos. Intenta de nuevo.",
  "auth.signin.error_user_not_found": "No hay cuenta con este correo. Regístrate primero.",
  "auth.forgot.title": "Restablecer contraseña",
  "auth.forgot.subtitle": "Ingresa tu correo para recibir un enlace de restablecimiento",
  "auth.forgot.email": "Correo electrónico",
  "auth.forgot.cta": "Enviar enlace",
  "auth.forgot.back": "Volver a iniciar sesión",
  "auth.forgot.success": "Revisa tu correo para el enlace de restablecimiento. Puede tardar unos minutos.",
  "auth.forgot.error_email_required": "Ingresa tu correo electrónico",
  "auth.forgot.error_email_invalid": "Ingresa un correo válido",
  "auth.forgot.error_failed": "No se pudo enviar el correo. Intenta de nuevo.",
  "auth.signup.title": "Crear cuenta",
  "auth.signup.subtitle": "Únete a WrenchUp y comienza",
  "auth.signup.role_label": "Soy:",
  "auth.signup.role_customer": "Cliente",
  "auth.signup.role_customer_desc": "Necesito un mecánico",
  "auth.signup.role_mechanic": "Mecánico",
  "auth.signup.role_mechanic_desc": "Ofrezco servicios",
  "auth.signup.email": "Correo electrónico",
  "auth.signup.password": "Contraseña",
  "auth.signup.password_placeholder": "Mínimo 8 caracteres",
  "auth.signup.confirm_password": "Confirmar contraseña",
  "auth.signup.confirm_placeholder": "Repite la contraseña",
  "auth.signup.cta": "Crear cuenta",
  "auth.signup.has_account": "¿Ya tienes cuenta?",
  "auth.signup.sign_in": "Iniciar sesión",
  "auth.signup.error_email_required": "El correo es obligatorio",
  "auth.signup.error_email_invalid": "Ingresa un correo válido",
  "auth.signup.error_password_required": "La contraseña es obligatoria",
  "auth.signup.error_password_short": "La contraseña debe tener al menos 8 caracteres",
  "auth.signup.error_password_mismatch": "Las contraseñas no coinciden",
  "auth.signup.error_failed": "No se pudo crear la cuenta. Intenta de nuevo.",
  "auth.signup.error_exists": "Este correo ya está registrado. Inicia sesión.",
  "auth.signup.error_weak_password": "Contraseña débil. Usa al menos 8 caracteres con letras y números.",
  "auth.signup.error_session": "Cuenta creada, pero no se inició la sesión. Inicia sesión para terminar tu perfil.",
  "auth.signup.error_verify_email": "¡Cuenta creada! Verifica tu correo y luego inicia sesión para completar tu perfil.",
};

const TABLES: Record<LocaleCode, Strings> = {
  en: STRINGS_EN,
  "es-MX": STRINGS_ES_MX,
};

/** Resolve effective region from preference + detected country. */
export function resolveRegion(preference: RegionPreference, detected: RegionCode | null): RegionCode {
  if (preference === "auto") return detected ?? "US";
  return preference;
}

export function localeForRegion(region: RegionCode): LocaleCode {
  return region === "MX" ? "es-MX" : "en";
}

export function isMexico(region: RegionCode): boolean {
  return region === "MX";
}

/**
 * Translate a key, optionally replacing {placeholders} with `params`.
 * Falls back to English if the key is missing in the requested locale.
 */
export function translate(locale: LocaleCode, key: StringKey, params?: Record<string, string | number>): string {
  const table = TABLES[locale] ?? STRINGS_EN;
  let raw = table[key] ?? STRINGS_EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      raw = raw.split(`{${k}}`).join(String(v));
    }
  }
  return raw;
}

/**
 * Format a price (USD value coming from fare logic) for display in the user's region.
 * In MX, applies the 60% discount and converts to MXN with a peso symbol.
 */
export function formatPrice(usdAmount: number, region: RegionCode): string {
  if (region === "MX") {
    const mxn = usdAmount * MX_DISCOUNT_MULTIPLIER * USD_TO_MXN_DISPLAY;
    return `$${formatNumber(mxn, "es-MX", 0)} MXN`;
  }
  // USD with 2 decimals like before
  return `$${formatNumber(usdAmount, "en", 2)}`;
}

function formatNumber(value: number, locale: LocaleCode, fractionDigits: number): string {
  try {
    return new Intl.NumberFormat(locale === "es-MX" ? "es-MX" : "en-US", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return value.toFixed(fractionDigits);
  }
}

/** Apply Mexico discount (40% of the original) to a USD-denominated number. */
export function applyDiscount(usdAmount: number, region: RegionCode): number {
  return region === "MX" ? usdAmount * MX_DISCOUNT_MULTIPLIER : usdAmount;
}
