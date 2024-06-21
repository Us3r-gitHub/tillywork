import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Delete,
    Put,
    UseGuards,
    Query,
} from "@nestjs/common";
import { ListFindAllResult, ListsService } from "./lists.service";
import { List } from "./list.entity";
import { CreateListDto } from "./dto/create.list.dto";
import { UpdateListDto } from "./dto/update.list.dto";
import { JwtAuthGuard } from "../auth/guards/jwt.auth.guard";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiBearerAuth()
@ApiTags("lists")
@UseGuards(JwtAuthGuard)
@Controller({
    path: "lists",
    version: "1",
})
export class ListsController {
    constructor(private readonly listsService: ListsService) {}

    @Get()
    findAll(@Query("spaceId") spaceId: number): Promise<ListFindAllResult> {
        return this.listsService.findAll({ spaceId });
    }

    @Get(":id")
    findOne(@Param("id") id: string): Promise<List> {
        return this.listsService.findOne(+id);
    }

    @Post()
    create(@Body() createListDto: CreateListDto): Promise<List> {
        return this.listsService.create(createListDto);
    }

    @Put(":id")
    update(
        @Param("id") id: string,
        @Body() updateListDto: UpdateListDto
    ): Promise<List> {
        return this.listsService.update(+id, updateListDto);
    }

    @Delete(":id")
    remove(@Param("id") id: string): Promise<void> {
        return this.listsService.remove(+id);
    }
}
