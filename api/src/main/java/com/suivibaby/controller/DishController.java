package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.DishResponse;
import com.suivibaby.model.DishSearchResponse;
import com.suivibaby.model.RenameDishRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.DishService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.UUID;

// The shared dish list is not scoped to a baby: any authenticated user may search it, and the DTO
// carries nothing but the label (D18-Y). Rights on rename/delete are checked in the service.
@Path("/api/dishes")
@Authenticated
public class DishController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    DishService dishService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public DishSearchResponse search(@QueryParam("q") String q) {
        return dishService.search(q);
    }

    @GET
    @Path("/manageable")
    @Produces(MediaType.APPLICATION_JSON)
    public List<DishResponse> manageable() {
        AppUser currentUser = currentUserResolver.require();
        return dishService.getManageableDishes(currentUser);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public DishResponse rename(@PathParam("id") UUID id, RenameDishRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return dishService.rename(currentUser, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        dishService.delete(currentUser, id);
        return Response.noContent().build();
    }
}
