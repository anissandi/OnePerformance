export interface UserProfile {
  name: string;
  initials: string;
  employeeId: string;
  position: string;
  department: string;
  division: string;
  companyUnit: string;
  location: string;
  email: string;
  phone: string;
  joinDate: string;
}

export const STAFF_PROFILE: UserProfile = {
  name: "Edward David",
  initials: "ED",
  employeeId: "E003",
  position: "Staf Keuangan",
  department: "Departemen Akuntansi & Keuangan",
  division: "Divisi Keuangan",
  companyUnit: "PT RSUP (Industry)",
  location: "Pekanbaru, Indonesia",
  email: "edward.david@rsup.sambu.co.id",
  phone: "+62 813-4567-8901",
  joinDate: "2021-06-15",
};

export const SUPERVISOR_PROFILE: UserProfile = {
  name: "Anis Sandi",
  initials: "AS",
  employeeId: "E001",
  position: "HR Strategic Specialist",
  department: "Human Resource Department",
  division: "Divisi Sumber Daya Manusia",
  companyUnit: "PT RSUP (Industry)",
  location: "Jakarta, Indonesia",
  email: "anis.sandi@sambugroup.com",
  phone: "+62 812-3456-7890",
  joinDate: "2019-03-15",
};
