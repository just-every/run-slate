import {createFileRoute} from '@tanstack/react-router';
import {InquiryWorkspace} from '../core/features/inquiries/ui/InquiryWorkspace';
export const Route=createFileRoute('/app/inquiries/$inquiryId')({component:Page});
function Page(){const {inquiryId}=Route.useParams();return <InquiryWorkspace id={inquiryId}/>;}
