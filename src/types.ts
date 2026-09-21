export interface Doctor {
  id: string;
  name: string;
  role: string; // e.g., "Master", "Senior Specialist", "Head of Dept"
  specialty: string;
  department: 'Cardiology' | 'Neurology' | 'Radiology' | 'Pediatrics' | 'Family Medicine';
  avatarColor: string;
  rating: number;
  experienceYears: number;
  bio: string;
  education: string;
  availableDays: string[];
  consultationFee: string;
}

export interface Article {
  id: string;
  date: string;
  title: string;
  category: string;
  readTime: string;
  summary: string;
  content: string[];
  accentColor: string;
}

export interface CheckupPackage {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  color: string;
}

export interface Appointment {
  id?: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  doctorName: string;
  specialty: string;
  date: string;
  time: string;
  notes?: string;
}
