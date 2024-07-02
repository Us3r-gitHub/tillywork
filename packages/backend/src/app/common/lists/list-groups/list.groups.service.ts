import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ListGroup } from "./list.group.entity";
import {
    ListGroupDueDate,
    ListGroupEntityTypes,
    ListGroupOptions,
} from "../types";
import { ListStagesService } from "../list-stages/list.stages.service";
import { UsersService } from "../../users/users.service";
import { CardsService } from "../../cards/cards.service";
import { FilterEntityTypes } from "../../filters/types";
import { CreateListGroupDto } from "./dto/create.list.group.dto";
import { FiltersService } from "../../filters/filters.service";
import { Filter } from "../../filters/filter.entity";
import { UpdateListGroupDto } from "./dto/update.list.group.dto";

export type GenerateGroupsParams = {
    listId: number;
    ignoreCompleted: boolean;
    groupBy: ListGroupOptions;
};

const DEFAULT_GROUP: CreateListGroupDto = {
    name: "All",
    type: ListGroupOptions.ALL,
};

@Injectable()
export class ListGroupsService {
    private readonly logger = new Logger("ListGroupsService");
    constructor(
        @InjectRepository(ListGroup)
        private listGroupsRepository: Repository<ListGroup>,
        private listStagesService: ListStagesService,
        private usersService: UsersService,
        private cardsService: CardsService,
        private filtersService: FiltersService
    ) {}

    async create(createListGroupDto: CreateListGroupDto): Promise<ListGroup> {
        const listGroup = this.listGroupsRepository.create(createListGroupDto);
        await this.listGroupsRepository.save(listGroup);

        return listGroup;
    }

    findAll({
        listId,
        groupBy,
    }: {
        listId: number;
        groupBy?: ListGroupOptions;
    }): Promise<ListGroup[]> {
        const query = this.listGroupsRepository
            .createQueryBuilder("listGroup")
            .innerJoinAndSelect("listGroup.list", "list")
            .leftJoinAndMapOne(
                "listGroup.filter",
                Filter,
                "filter",
                "filter.entityId = listGroup.id AND filter.entityType = :entityType",
                { entityType: FilterEntityTypes.LIST_GROUP }
            )
            .where("listGroup.listId = :listId", { listId })
            .orderBy("listGroup.order", "ASC");

        if (groupBy) {
            query.andWhere("listGroup.type = :groupBy", { groupBy });
        }

        return query.getMany();
    }

    async generateGroups({
        listId,
        ignoreCompleted,
        groupBy,
    }: GenerateGroupsParams): Promise<ListGroup[]> {
        const existingGroups = await this.findAll({
            listId,
            groupBy,
        });

        let cardGroups: CreateListGroupDto[];

        switch (groupBy) {
            case ListGroupOptions.LIST_STAGE:
                cardGroups = await this.generateGroupsByListStage({ listId });
                break;
            case ListGroupOptions.ASSIGNEES:
                cardGroups = await this.generateGroupsByAssignees(listId);
                break;
            case ListGroupOptions.DUE_DATE:
                cardGroups = await this.generateGroupsByDueDate();
                break;
            default:
                cardGroups = [DEFAULT_GROUP];
        }

        /** Compare generated groups with existing groups */
        const checkIfGroupsExist = cardGroups.map((generatedGroup) => {
            return new Promise<{ exists: boolean; group: ListGroup }>(
                (resolve) => {
                    const check = existingGroups.find(
                        (group) =>
                            group.entityId == generatedGroup.entityId &&
                            group.entityType == generatedGroup.entityType &&
                            group.name == generatedGroup.name
                    );

                    if (!check) {
                        this.create({
                            ...generatedGroup,
                            isExpanded: true,
                            type: groupBy,
                            listId,
                        }).then((group) => {
                            if (generatedGroup.filter) {
                                this.filtersService
                                    .create({
                                        entityId: group.id,
                                        entityType:
                                            FilterEntityTypes.LIST_GROUP,
                                        where: generatedGroup.filter.where,
                                    })
                                    .then(() =>
                                        resolve({ exists: false, group })
                                    );
                            } else {
                                resolve({ exists: false, group });
                            }
                        });
                    } else {
                        resolve({ exists: true, group: check });
                    }
                }
            );
        });

        await Promise.allSettled(checkIfGroupsExist);

        let finalGroups = await this.findAll({
            listId,
            groupBy,
        });

        if (groupBy === ListGroupOptions.LIST_STAGE && ignoreCompleted) {
            const listStages = await this.listStagesService.findBy({
                where: { listId, isCompleted: false },
            });

            finalGroups = finalGroups.filter((group) =>
                listStages
                    .map((listStage) => listStage.name)
                    .includes(group.name)
            );
        }

        return finalGroups;
    }

    async generateGroupsByListStage({
        listId,
    }: {
        listId: number;
    }): Promise<CreateListGroupDto[]> {
        const stages = await this.listStagesService.findAll({ listId });

        return stages.map((stage) => {
            const group: CreateListGroupDto = {
                entityId: stage.id,
                entityType: ListGroupEntityTypes.LIST_STAGE,
                type: ListGroupOptions.LIST_STAGE,
                name: stage.name,
                filter: {
                    where: {
                        and: [
                            {
                                field: "cardLists.listStageId",
                                operator: "eq",
                                value: stage.id,
                            },
                        ],
                    },
                },
                color: stage.color,
                order: stage.order,
            };

            return group;
        });
    }

    async generateGroupsByAssignees(listId: number) {
        const users = (
            await this.usersService.findAll({
                where: {
                    projects: {
                        project: {
                            workspaces: {
                                spaces: {
                                    lists: {
                                        id: listId,
                                    },
                                },
                            },
                        },
                    },
                },
            })
        ).users;

        const groups: CreateListGroupDto[] = users.map((user, index) => {
            const group: CreateListGroupDto = {
                entityId: user.id,
                entityType: ListGroupEntityTypes.USER,
                type: ListGroupOptions.ASSIGNEES,
                name: user.firstName + " " + user.lastName,
                icon: user.photo,
                filter: {
                    where: {
                        and: [
                            {
                                field: "users.id",
                                operator: "eq",
                                value: user.id,
                            },
                        ],
                    },
                },
                order: index + 1,
            };

            return group;
        });

        groups.push({
            entityId: null,
            entityType: null,
            type: ListGroupOptions.ASSIGNEES,
            name: "No Assignee",
            filter: {
                where: {
                    and: [
                        {
                            field: "users.id",
                            operator: "isNull",
                            value: null,
                        },
                    ],
                },
            },
        });

        return groups;
    }

    async generateGroupsByDueDate() {
        const groups: CreateListGroupDto[] = [
            {
                type: ListGroupOptions.DUE_DATE,
                name: ListGroupDueDate.PAST_DUE,
                filter: {
                    where: {
                        and: [
                            {
                                field: "card.dueAt",
                                operator: "lt",
                                value: ":startOfDay",
                            },
                        ],
                    },
                },
                icon: "mdi-clock-time-eight",
                color: "error",
                order: 1,
            },
            {
                type: ListGroupOptions.DUE_DATE,
                name: ListGroupDueDate.TODAY,
                filter: {
                    where: {
                        and: [
                            {
                                field: "card.dueAt",
                                operator: "between",
                                value: [":startOfDay", ":endOfDay"],
                            },
                        ],
                    },
                },
                icon: "mdi-clock-time-twelve",
                color: "info",
                order: 2,
            },
            {
                type: ListGroupOptions.DUE_DATE,
                name: ListGroupDueDate.UPCOMING,
                filter: {
                    where: {
                        and: [
                            {
                                field: "card.dueAt",
                                operator: "gt",
                                value: ":endOfDay",
                            },
                        ],
                    },
                },
                icon: "mdi-clock-time-four",
                color: "default",
                order: 3,
            },
            {
                type: ListGroupOptions.DUE_DATE,
                name: ListGroupDueDate.NO_DUE_DATE,
                filter: {
                    where: {
                        and: [
                            {
                                field: "card.dueAt",
                                operator: "isNull",
                                value: null,
                            },
                        ],
                    },
                },
                icon: "mdi-clock-time-six-outline",
                color: "default",
                order: 4,
            },
        ];

        return groups;
    }

    async findOne(id: number): Promise<ListGroup> {
        const listGroup = await this.listGroupsRepository.findOne({
            where: {
                id,
            },
        });
        if (!listGroup) {
            throw new NotFoundException(`List Group with ID ${id} not found`);
        }
        return listGroup;
    }

    async update(
        id: number,
        updateListGroupDto: UpdateListGroupDto
    ): Promise<ListGroup> {
        const listGroup = await this.findOne(id);
        this.listGroupsRepository.merge(listGroup, updateListGroupDto);
        return this.listGroupsRepository.save(listGroup);
    }
}
