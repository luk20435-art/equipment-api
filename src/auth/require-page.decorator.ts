import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PAGE_KEY = 'require_page';
export const RequiresPage = (page: string) => SetMetadata(REQUIRE_PAGE_KEY, page);
