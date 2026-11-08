package com.suivibaby.controller;

import com.suivibaby.model.DishSearchResponse;
import com.suivibaby.service.DishService;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;

// The shared dish list is not scoped to a baby: any authenticated user may search it, and the DTO
// carries nothing but the label (D18-Y).
@Path("/api/dishes")
@Authenticated
public class DishController {

    @Inject
    DishService dishService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public DishSearchResponse search(@QueryParam("q") String q) {
        return dishService.search(q);
    }
}
