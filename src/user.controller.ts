import {
  Post,
  Delete,
  Route,
  Tags,
  Security,
  Request,
  Path,
  Controller,
  Res,
  TsoaResponse,
  Get,
  SuccessResponse,
} from "tsoa";
import { AppDataSource, User, Follow, Pins } from "./models";
import type { JwtPayload } from "./utils";

interface UserProfileResponse {
  id: number;
  username: string;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  followers: number;
  following: number;
  pins?: Pins[];
}

@Route("users")
@Tags("Users & Follows")
export class UserController extends Controller {
  @Security("jwt")
  @SuccessResponse(200, "Followed")
  @Post("{userIdToFollow}/follow")
  public async followUser(
    @Request() req: Express.Request,
    @Path() userIdToFollow: number,
    @Res() notFound: TsoaResponse<404, { message: string }>,
    @Res() conflict: TsoaResponse<409, { message: string }>,
    @Res() badRequest: TsoaResponse<400, { message: string }>
  ): Promise<{ message: string }> {
    const currentUser = req.user as JwtPayload;

    if (currentUser.userId === userIdToFollow) {
      return badRequest(400, { message: "You cannot follow yourself." });
    }

    const userToFollow = await AppDataSource.getRepository(User).findOneBy({
      id: userIdToFollow,
    });
    if (!userToFollow) {
      return notFound(404, { message: "User to follow not found." });
    }

    const followRepo = AppDataSource.getRepository(Follow);
    const exists = await followRepo.findOneBy({
      followerId: currentUser.userId,
      followedId: userIdToFollow,
    });

    if (exists) {
      return conflict(409, { message: "You are already following this user." });
    }

    const newFollow = followRepo.create({
      followerId: currentUser.userId,
      followedId: userIdToFollow,
    });

    await followRepo.save(newFollow);
    this.setStatus(200);
    return { message: `Successfully followed user ${userIdToFollow}` };
  }

  @Security("jwt")
  @SuccessResponse(200, "Unfollowed")
  @Delete("{userIdToUnfollow}/unfollow")
  public async unfollowUser(
    @Request() req: Express.Request,
    @Path() userIdToUnfollow: number,
    @Res() notFound: TsoaResponse<404, { message: string }>
  ): Promise<{ message: string }> {
    const currentUser = req.user as JwtPayload;

    const result = await AppDataSource.getRepository(Follow).delete({
      followerId: currentUser.userId,
      followedId: userIdToUnfollow,
    });

    if (result.affected === 0) {
      return notFound(404, { message: "Follow relationship not found." });
    }

    return { message: `Successfully unfollowed user ${userIdToUnfollow}` };
  }

  @Get("{userId}/profile")
  public async getUserProfile(
    @Path() userId: number,
    @Res() notFound: TsoaResponse<404, { message: string }>
  ): Promise<UserProfileResponse> {
    const userRepo = AppDataSource.getRepository(User);
    const followRepo = AppDataSource.getRepository(Follow);

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return notFound(404, { message: "User not found" });
    }

    const followers = await followRepo.count({ where: { followedId: userId } });
    const following = await followRepo.count({ where: { followerId: userId } });
    const pins = await AppDataSource.getRepository(Pins).find({
      where: { userId },
      relations: ["post"],
    });

    return {
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      followers,
      following,
      pins,
    };
  }

  @Get("{userId}/pins")
  public async getPinners(
    @Path() userId: number,
    @Res() notFound: TsoaResponse<404, { message: string }>
  ): Promise<{ pins: Pins[] }> {
    const pins = await AppDataSource.getRepository(Pins).find({
      where: { userId },
      relations: ["post"],
    });

    if (pins.length === 0) {
      return notFound(404, { message: "No pins found for this user." });
    }

    return { pins };
  }
  @Get("{userId}/followers")
  public async getFollowers(
    @Path() userId: number,
    @Res() notFound: TsoaResponse<404, { message: string }>
  ): Promise<{ followers: User[] }> {
    const followRepo = AppDataSource.getRepository(Follow);
    const userRepo = AppDataSource.getRepository(User);

    const follows = await followRepo.find({
      where: { followedId: userId },
      relations: ["follower"],
    });

    if (follows.length === 0) {
      return notFound(404, { message: "No followers found for this user." });
    }

    const followers = follows.map((follow) => follow.follower);
    return { followers };
  }

  @Get("{userId}/following")
  public async getFollowing(
    @Path() userId: number,
    @Res() notFound: TsoaResponse<404, { message: string }>
  ): Promise<{ following: User[] }> {
    const followRepo = AppDataSource.getRepository(Follow);
    const userRepo = AppDataSource.getRepository(User);

    const follows = await followRepo.find({
      where: { followerId: userId },
      relations: ["followed"],
    });

    if (follows.length === 0) {
      return notFound(404, { message: "No following found for this user." });
    }

    const following = follows.map((follow) => follow.followed);
    return { following };
  }
}
