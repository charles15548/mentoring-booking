import MenteeLayout from "@/components/dashboard-layout"; 

export default function Layout({children}:{children: React.ReactNode}){
    return <MenteeLayout>{children}</MenteeLayout>
}