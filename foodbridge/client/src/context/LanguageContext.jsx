import React, { createContext, useContext, useState, useEffect } from 'react';

const translations = {
  en: {
    appName: 'FoodBridge',
    tagline: 'Hyperlocal Smart Food Redistribution & Volunteer Network',
    logout: 'Log out',
    refresh: 'Refresh',
    loading: 'Loading...',
    
    // Volunteer
    volunteerTitle: 'Delivery Volunteer',
    volunteerSubtitle: 'Real-Time Rescue Tracker & Delivery Coordination',
    myQueue: 'My Delivery Queue',
    noDeliveries: 'No delivery assignments yet.',
    noDeliveriesSub: 'Check back when the admin assigns a delivery to you.',
    activeBadge: 'Active Run',
    acceptAssignment: 'Accept Assignment',
    rejectAssignment: 'Reject',
    viewMap: 'View Map',
    hideMap: 'Hide Map',
    viewTimeline: 'View Timeline',
    hideTimeline: 'Hide Timeline',
    shareGPS: 'Share Live Location',
    stopGPS: 'Stop Sharing GPS',
    gpsLive: 'GPS Live',
    scanQrPin: 'Verify (QR / PIN)',
    pickupProof: 'Pickup Photo Proof',
    deliveryProof: 'Delivery Photo Proof',
    uploadPhoto: 'Upload Photo Proof',
    takePhoto: 'Take / Choose Photo',
    verifyPickupTitle: 'Verify Food Pickup',
    verifyDeliveryTitle: 'Verify Food Delivery',
    enterPin: 'Enter 6-digit backup code',
    verifyBtn: 'Confirm Verification',
    completedRuns: 'completed / failed deliveries',
    karmaPoints: 'Karma Points',
    leaderboard: 'Leaderboard',
    topVolunteers: 'Top Volunteer Rescuers',
    downloadCert: 'Rescue Certificate',
    printCert: 'Print / Save Certificate',
    mealsRescued: 'Meals Rescued',
    runsCompleted: 'Deliveries Completed',
    
    // Stages
    donation_created: 'Donation Created',
    accepted: 'Accepted / Allocated',
    allocated: 'Allocated',
    volunteer_assigned: 'Volunteer Assigned',
    assigned: 'Volunteer Assigned',
    volunteer_accepted: 'Assignment Accepted',
    assignment_accepted: 'Assignment Accepted',
    arrived_pickup: 'Arrived at Pickup',
    food_collected: 'Food Collected',
    picked_up: 'Food Collected',
    in_transit: 'In Transit',
    out_for_delivery: 'In Transit',
    arrived_destination: 'Arrived at Destination',
    arrived_recipient: 'Arrived at Destination',
    delivered: 'Delivered ✓',
    confirmed: 'Delivered ✓',
    failed: 'Failed / Cancelled',
    cancelled: 'Cancelled',
    
    // Donor & Dashboard
    postDonation: 'Donate Surplus Food',
    postRequirement: 'Request Food Aid',
    myDonations: 'My Donations',
    myRequirements: 'My Food Needs',
    aiFreshnessTitle: 'AI Freshness & Safety Inspector',
    aiAnalyzeBtn: 'Scan Freshness with AI',
    analyzingAI: 'AI is analyzing food condition...',
    environmentalImpact: 'Environmental & Social Impact',
    co2Avoided: 'CO₂ Avoided',
    waterSaved: 'Water Conserved',
    exportReport: 'Export Impact Report (CSV)',
    openInGmaps: 'Open in Google Maps'
  },
  ta: {
    appName: 'ஃபுட்பிரிட்ஜ்',
    tagline: 'உணவு வீணாவதைத் தடுக்கும் அதிவேக உதவி மற்றும் தன்னார்வலர் தளம்',
    logout: 'வெளியேறு',
    refresh: 'புதுப்பி',
    loading: 'ஏற்றப்படுகிறது...',
    
    // Volunteer
    volunteerTitle: 'உணவு மீட்பு தன்னார்வலர்',
    volunteerSubtitle: 'நிகழ்நேர உணவு மீட்பு மற்றும் விநியோக ஒருங்கிணைப்பு',
    myQueue: 'எனது விநியோகப் பட்டியல்',
    noDeliveries: 'தற்போது விநியோகப் பணிகள் எதுவும் ஒதுக்கப்படவில்லை.',
    noDeliveriesSub: 'புதிய பணிகள் ஒதுக்கப்படும்போது இங்கே தோன்றும்.',
    activeBadge: 'செயலில் உள்ள பணி',
    acceptAssignment: 'பணியை ஏற்றுக்கொள்',
    rejectAssignment: 'மறுக்க',
    viewMap: 'வரைபடம் காண்க',
    hideMap: 'வரைபடம் மறை',
    viewTimeline: 'காலவரிசை காண்க',
    hideTimeline: 'காலவரிசை மறை',
    shareGPS: 'இருப்பிடத்தைப் பகிர்',
    stopGPS: 'இருப்பிடப் பகிர்வை நிறுத்து',
    gpsLive: 'GPS இயங்குகிறது',
    scanQrPin: 'QR / PIN மூலம் சரிபார்',
    pickupProof: 'உணவு எடுத்ததற்கான புகைப்படச் சான்று',
    deliveryProof: 'ஒப்படைத்ததற்கான புகைப்படச் சான்று',
    uploadPhoto: 'புகைப்படச் சான்று பதிவேற்று',
    takePhoto: 'புகைப்படம் எடு / தேர்ந்தெடு',
    verifyPickupTitle: 'உணவு எடுப்பதைச் சரிபார்',
    verifyDeliveryTitle: 'உணவு ஒப்படைப்பைச் சரிபார்',
    enterPin: '6-இலக்க ரகசியக் குறியீடு (PIN)',
    verifyBtn: 'சரிபார்ப்பை உறுதிசெய்',
    completedRuns: 'நிறைவடைந்த / கைவிடப்பட்ட பணிகள்',
    karmaPoints: 'நற்பணிப் புள்ளிகள் (Karma)',
    leaderboard: 'முன்னிலை தன்னார்வலர்கள்',
    topVolunteers: 'சிறந்த உணவு மீட்பாளர்கள்',
    downloadCert: 'பாராட்டுச் சான்றிதழ்',
    printCert: 'சான்றிதழை அச்சிடு / PDF சேமி',
    mealsRescued: 'மீட்கப்பட்ட உணவுகள்',
    runsCompleted: 'முடிக்கப்பட்ட விநியோகங்கள்',
    
    // Stages
    donation_created: 'உணவு பதிவு செய்யப்பட்டது',
    accepted: 'ஏற்கப்பட்டது / ஒதுக்கப்பட்டது',
    allocated: 'ஒதுக்கப்பட்டது',
    volunteer_assigned: 'தன்னார்வலர் நியமிக்கப்பட்டார்',
    assigned: 'தன்னார்வலர் நியமிக்கப்பட்டார்',
    volunteer_accepted: 'பணி ஏற்கப்பட்டது',
    assignment_accepted: 'பணி ஏற்கப்பட்டது',
    arrived_pickup: 'உணவு எடுக்கும் இடத்தை அடைந்தார்',
    food_collected: 'உணவு சேகரிக்கப்பட்டது',
    picked_up: 'உணவு சேகரிக்கப்பட்டது',
    in_transit: 'பயணத்தில் உள்ளது',
    out_for_delivery: 'பயணத்தில் உள்ளது',
    arrived_destination: 'சேரும் இடத்தை அடைந்தார்',
    arrived_recipient: 'சேரும் இடத்தை அடைந்தார்',
    delivered: 'வெற்றிகரமாக வழங்கப்பட்டது ✓',
    confirmed: 'வெற்றிகரமாக வழங்கப்பட்டது ✓',
    failed: 'தோல்வி / ரத்து செய்யப்பட்டது',
    cancelled: 'ரத்து செய்யப்பட்டது',
    
    // Donor & Dashboard
    postDonation: 'உணவு தானம் பதிவு செய்',
    postRequirement: 'உணவுத் தேவை பதிவு செய்',
    myDonations: 'எனது உணவுப் பதிவுகள்',
    myRequirements: 'எனது உணவுத் தேவைகள்',
    aiFreshnessTitle: 'AI உணவுப் புத்துணர்ச்சி & பாதுகாப்பு சோதனையாளர்',
    aiAnalyzeBtn: 'AI மூலம் தரத்தை சோதி',
    analyzingAI: 'AI உணவின் நிலையை ஆராய்கிறது...',
    environmentalImpact: 'சுற்றுச்சூழல் மற்றும் சமூக தாக்கம்',
    co2Avoided: 'தவிர்க்கப்பட்ட CO₂ வாயு',
    waterSaved: 'சேமிக்கப்பட்ட தண்ணீர்',
    exportReport: 'தாக்க அறிக்கை பதிவிறக்கு (CSV)',
    openInGmaps: 'Google Maps-ல் பார்க்க'
  }
};

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return localStorage.getItem('foodbridge:lang') || 'en';
  });

  useEffect(() => {
    localStorage.setItem('foodbridge:lang', lang);
  }, [lang]);

  const toggleLanguage = () => {
    setLang((prev) => (prev === 'en' ? 'ta' : 'en'));
  };

  const t = (key) => {
    return translations[lang]?.[key] || translations.en?.[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
