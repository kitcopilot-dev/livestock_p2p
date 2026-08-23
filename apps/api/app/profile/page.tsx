import { ProfileClient } from "./ProfileClient";
import { getProfile } from "../actions/profile";

export const metadata = { title: "My Profile — Livestock P2P" };

export default async function ProfilePage() {
  const profile = await getProfile();
  return <ProfileClient profile={profile} />;
}
