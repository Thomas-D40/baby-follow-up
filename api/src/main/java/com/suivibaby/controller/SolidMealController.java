package com.suivibaby.controller;

import com.suivibaby.entity.AppUser;
import com.suivibaby.model.CreateSolidMealRequest;
import com.suivibaby.model.DishSuggestionsResponse;
import com.suivibaby.model.SolidMealPage;
import com.suivibaby.model.SolidMealResponse;
import com.suivibaby.model.UpdateSolidMealRequest;
import com.suivibaby.security.CurrentUser;
import com.suivibaby.service.SolidMealService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.UUID;

@Path("/api/babies/{babyId}/solid-meals")
@Authenticated
public class SolidMealController {

    @Inject
    CurrentUser currentUserResolver;

    @Inject
    SolidMealService solidMealService;

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response create(@PathParam("babyId") UUID babyId, CreateSolidMealRequest request) {
        AppUser currentUser = currentUserResolver.require();
        SolidMealResponse created = solidMealService.create(currentUser.id, babyId, request);
        return Response.status(Response.Status.CREATED).entity(created).build();
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public SolidMealPage list(@PathParam("babyId") UUID babyId,
                              @QueryParam("limit") @DefaultValue("20") int limit,
                              @QueryParam("before") String before) {
        AppUser currentUser = currentUserResolver.require();
        return solidMealService.list(currentUser.id, babyId, limit, before);
    }

    @GET
    @Path("/dish-suggestions")
    @Produces(MediaType.APPLICATION_JSON)
    public DishSuggestionsResponse dishSuggestions(@PathParam("babyId") UUID babyId,
                                                   @QueryParam("q") String q) {
        AppUser currentUser = currentUserResolver.require();
        return solidMealService.getDishSuggestions(currentUser.id, babyId, q);
    }

    @PATCH
    @Path("/{id}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public SolidMealResponse update(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id,
                                    UpdateSolidMealRequest request) {
        AppUser currentUser = currentUserResolver.require();
        return solidMealService.update(currentUser.id, babyId, id, request);
    }

    @DELETE
    @Path("/{id}")
    public Response delete(@PathParam("babyId") UUID babyId, @PathParam("id") UUID id) {
        AppUser currentUser = currentUserResolver.require();
        solidMealService.delete(currentUser.id, babyId, id);
        return Response.noContent().build();
    }
}
