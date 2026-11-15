import { redirect } from 'next/navigation';

export default function SkillsPage() {
  redirect('/prompts?tab=skills');
}
