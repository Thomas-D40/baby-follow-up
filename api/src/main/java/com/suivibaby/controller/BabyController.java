package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.BabyResponse;
import com.suivibaby.model.CreateBabyRequest;
import com.suivibaby.model.CreateBabyResponse;
import com.suivibaby.model.UpdateBabyRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.BabyService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

/**
 * CRUD of the current user's babies (US2.1, US2.2, D2-E). Every operation is bounded by membership
 * through the service layer: unlinked resource → <strong>404</strong>; no session → 401. Creation
 * auto-links the creator (US2.1). The full event-write IDOR contract (D2-D) is enforced from epic 3.
 */
@Path("/api/babies")
@Authenticated
public class BabyController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    BabyService babyService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<BabyResponse> myBabies() {
        AppUser currentUser = currentUserResolver.require();
        return babyService.getBabiesByUserId(currentUser.id);
    }

    @GET
    @Path("/{babyId}")
    @Produces(MediaType.APPLICATION_JSON)
    public BabyResponse getBaby(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        return babyService.getForUser(currentUser.id, babyId);
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@Valid CreateBabyRequest request) {
        AppUser currentUser = currentUserResolver.require();
        CreateBabyResponse created = babyService.create(currentUser.id, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @PATCH
    @Path("/{babyId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public BabyResponse update(@PathParam("babyId") UUID babyId, UpdateBabyRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return babyService.update(currentUser.id, babyId, request);
    }

    @DELETE
    @Path("/{babyId}")
    public Response delete(@PathParam("babyId") UUID babyId) {
        AppUser currentUser = currentUserResolver.require();
        babyService.delete(currentUser.id, babyId);
        return Response.noContent().build();
    }
}
